const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const CronJob = require('cron').CronJob;

const socketList = [];

const FavBarPrefix = "FAV";
const Bar = Parse.Object.extend("Bar");
const Favorite = Parse.Object.extend("Favorite");
const minutesUntillOffline = 5;

const recheckAllUsers = () => {
    console.log('===> recheckAllUsers ', new Date())

    const usersQuery = new Parse.Query(Parse.User);

    // Time check
    const timeNow = new Date().getTime();
    const queryDate = new Date();
    queryDate.setTime(timeNow - (minutesUntillOffline * 60 * 1000)); // N minutes ago

    usersQuery.lessThan('lastOnline', queryDate);
    usersQuery.equalTo('away', true);
    usersQuery.equalTo('online', true);
    usersQuery.each((user) => {
        console.log('Found idle user', user.id);

        const socketIds = user.get('socketIds');
        if (socketIds.length) { return; } // Just to be sure

        const attempts = user.get('atempts') - 1 || 0;
        if (attempts > 0) {
            user.set('atempts', attempts);
            user.save();
        } else {
            // add this block from 'updateUserOnline'
            if (!socketIds.length) {
                if (user.get('currentBar')) {
                    Parse.Cloud.run('leaveBar', { barId: user.get('currentBar').id, userId: user.id });
                }
                user.set('online', false);
                user.save(null, { useMasterKey: true });
            } else {
                console.log("This case should not be happen, but for some unknown reason it is happens!");
            }
            
        }
    });
};

const getSocketWithId = (socketId) => socketList.find(socket => socket.id === socketId) || null;

const socketDisconnected = (clientSocket) => getParseUserBySocketId(clientSocket.id, (user) => {
    if (!user) { return; }
    let currentBar = user.get('currentBar')

    const socketIds = user.get('socketIds') || [];
    const activeSocketIds = socketIds.filter((socketId) => {
        const socket = getSocketWithId(socketId);
        return !!(socket && socket.connected);
    });

    if (!activeSocketIds.length) {
        // Parse.Cloud.run('updateUserOnline', { userId: user.id, status: false });
        user.set('away', true);
        user.set('atempts', minutesUntillOffline);
        user.set('lastOnline', new Date());
        if (currentBar) {
            setTimeout(() => {
                checkUserStatusAway(user.id)
            }, 60000 * 5)
        }
    }

    user.set('socketIds', activeSocketIds);

    user.save(null, {
        success: (user) => console.log('checkSocketAndUpdateStatus user saved'),
        error: (error) => console.error(error)
    });
}, (error) => console.error(error));

const checkUserStatusAway = (userId) => {
    getParseUser(userId, (user) => {
        let currentBar = user.get('currentBar')
        let isAway = user.get('away')
        if (isAway && currentBar) {
            Parse.Cloud.run('leaveBar', { barId: currentBar.id, userId: userId });            
        }
    })
}

const heartBeatInterval = setInterval(() => io.sockets.emit('ping', { beat : 1 }), 8000);

const connectToFavBarsChannels = (clientSocket, userId, disconnect) =>
    getParseUser(userId,
        (user) => {
            console.log('connectToFavBarsChannels user found', user.id);
            // Parse.Cloud.run('getFavoriteBars', {userId: user.id});
            Parse.Cloud.run('getFavoriteBars', { userId: user.id })
                .then(
                    (bars) => {
                        bars.forEach((bar) => clientSocket[(disconnect) ? 'leave' : 'join'](FavBarPrefix + bar.id))
                    },
                    (error) => console.error(error)
                );
        },
        (error) => console.error(error));

io.on('connection', function(clientSocket) {

    clientSocket.emit('connectedWithId', clientSocket.id);

    clientSocket.on('registerAs', (userId, handler) => {
        clientSocket.join(userId);

        Parse.Cloud.run('updateUserOnline', { userId, status: true });

        getParseUser(userId, (user) => {
            user.set('lastOnline', new Date());
            user.set('away', false);
            user.addUnique('socketIds', clientSocket.id);

            // connectToFavBarsChannels(clientSocket, user.id, false);

            socketList.push(clientSocket); // WTF?

            user.save(null, { useMasterKey:true }).then(
                result => handler(result.id),
                (error) => console.error(error)
            );
        },
            (error) => console.error(error));
    });

    clientSocket.on('pong', (data) =>
        getParseUserBySocketId(clientSocket.id,
            (user) => {
                user.set('lastOnline', new Date());
                user.save();
            },
            () => {
            }));

    clientSocket.on('disconnect', () => socketDisconnected(clientSocket));

    clientSocket.on("notifyBar", function(barId) {
        sendNeedupdateForBar(barId);
    });

    clientSocket.on("joinRoom", function(roomId, userId, handler) {

        getParseUser(userId, function(user) {
            leavePreviousRoom(user);
            Parse.Cloud.run('visitRoom', { 'roomId': roomId, 'userId': user.id }, {
                success: function(room) {
                    clientSocket.join(roomId);
                    sendNeedupdateForBar(room.get('bar').id);
                    io.to(roomId).emit("newRoomParticipant", { 'roomId': roomId, 'userId': user.id });
                    handler({ 'success': true });
                }, error: function(error) {
                    handler({ 'success': false });
                }
            });
        }, function() {
            handler({ 'success': false });
        });
    });

    clientSocket.on("joinConversation", function(roomId, handler) {
        getParseUserBySocketId(clientSocket.id, function(user) {
            var previousConversationId = user.get('currentConversationId');
            if (previousConversationId) {
                if (previousConversationId == roomId) {
                    clientSocket.leave(previousConversationId);
                }
            }
            user.set('currentConversationId', roomId);
            user.save(null, {
                success: function(user) {
                    clientSocket.join(roomId);
                    handler({ 'success': true });
                }, error: function(error) {
                    handler({ 'success': false, 'error': error });
                }
            });
        }, function() {
            handler({ 'success': false });
        });
    });

    clientSocket.on("leaveConversation", function(roomId, handler) {
        getParseUserBySocketId(clientSocket.id, function(user) {
            var previousConversationId = user.get('currentConversationId');
            user.unset('currentConversationId');
            user.save(null, {
                success: function(user) {
                    if (previousConversationId) {
                        clientSocket.leave(previousConversationId);
                    }
                    handler({ 'success': true });
                }, error: function(error) {
                    handler({ 'success': false, 'error': error });
                }
            });
        }, function() {
            handler({ 'success': false });
        });
    });

    function leavePreviousRoom(user) {
        var previousRoomId = user.get('currentRoomId');
        if (previousRoomId) {
            clientSocket.leave(previousRoomId);
            console.log('USER FORCE LEAVED' + previousRoomId);
        }
    }

    clientSocket.on("getUserIdList", function(roomId, handler) {
        findClientsSocketByRoomIdWithHandler(roomId, handler);
    });

    clientSocket.on("leaveRoom", function(roomId) {
        getParseUserBySocketId(clientSocket.id, function(user) {
            Parse.Cloud.run('leaveRoom', { 'roomId': roomId, 'userId': user.id }, {
                success: function(object) {
                    clientSocket.leave(roomId);
                    console.log('USER LEAVED' + roomId);
                    io.to(roomId).emit("groupRoomLeaved", { 'roomId': roomId, 'userId': user.id });
                }
            })
        }, function() {

        });
    });

    clientSocket.on("visitBar", function(barId, userId, handler) {
        getParseUser(userId, function(user) {
            var shouldIntroduce = user.get('currentBar') == null;
            leavePreviousRoom(user);
            Parse.Cloud.run('visitBar', { 'userId': userId, 'barId': barId }).then(function(barRoom) {
                clientSocket.join(barId);
                clientSocket.join(barRoom.id);
                if (barRoom.id) {
                    sendNeedupdateForBar(barId);
                    if (shouldIntroduce) {
                        io.to(barId).emit("barVisited", { 'barId': barId, 'userId': userId });

                    }
                    handler({ "success": true, 'barRoomId': barRoom.id });
                } else {
                    handler({ "success": false });
                }
            });
        }, function() {
            handler({ "success": false });
        });
    });

    clientSocket.on("leaveBar", function(barId, userId, handler) {
        clientSocket.leave(barId);
        getParseUser(userId, function(user) {
            leavePreviousRoom(user);
            handler({ "success": true });
            io.to(barId).emit("barLeaved", { 'barId': barId, 'userId': userId });
            Parse.Cloud.run('leaveBar', { 'barId': barId, 'userId': userId });
        }, function() {
            handler({ "success": false });
        });
    });

    clientSocket.on('chatMessage', function(roomId, message, handler) {
        getParseUserBySocketId(clientSocket.id, function(user) {
            var userId = user.id;

            var currentDateTime = new Date().toLocaleString();
            console.log(message + " <- Message revieved from " + userId + " In room " + roomId + " Date: " + currentDateTime);
            io.to(roomId).emit("newChatMessage", message, userId, currentDateTime, roomId, false);
            handler({ 'success': true });
        }, function() {
            handler({ 'success': false });
            // Place for handler, TODO
        });
    });

    clientSocket.on('privateMessage', function(recieverId, message, conversationId, senderNickname, handler) {
        Parse.Cloud.useMasterKey();
        getParseUserBySocketId(clientSocket.id, function(user) {
            var userId = user.id;
            var currentDateTime = new Date().toLocaleString();
            console.log(message + " <----- Private message revieved from " + userId + " In conversation " + conversationId + " Date: " + currentDateTime);

            var BlockedUser = Parse.Object.extend("BlockedUser");
            var query = new Parse.Query(BlockedUser);
            query.equalTo("issuerId", recieverId);
            query.equalTo("userId", userId);

            query.first({
                success: function(blockedUser) {
                    if (blockedUser == null) {
                        console.log("-> -> -> Send private message");
                        storePrivateMessageToParse(userId, message, conversationId, recieverId, senderNickname);
                        io.to(conversationId).emit("newChatMessage", message, userId, currentDateTime, conversationId, true);
                        io.to(recieverId).emit("newPrivateMessage", message, userId, currentDateTime, conversationId, true);
                        handler({ 'success': true });
                    }
                    else {
                        console.log("-> -> -> Block private message");
                        handler({ 'success': false });
                    }
                },
                error: function(error) {
                    handler({ 'success': false });
                }
            });
        }, function() {
            handler({ 'success': false });
            // Place for handler, TODO
        });
    });

    clientSocket.on('getUnreadConversationsCount', function(request, handler) {
        var userId = request.userId;
        var exeptConversationWithId = request.exeptConversationWithId;
        var countPending = request.countPending;
        var countActive = request.countActive;
        getParseUser(userId, function(user) {
            //var exeptConversationWithId = payload.conversationId;
            var lastMessageQuery = new Parse.Query(RoomMessage);
            lastMessageQuery.equalTo('viewed', false);
            lastMessageQuery.equalTo('recipientId', user.id);

            if (exeptConversationWithId) {
                lastMessageQuery.notEqualTo('roomId', exeptConversationWithId);
            }

            var conversationsQuery = new Parse.Query(Conversation);
            conversationsQuery.matchesQuery('lastMessage', lastMessageQuery);

            if (countPending && countActive) {

            } else if (countPending) {
                conversationsQuery.notContainedIn("acceptedParticipantIds", [user.id]);
            } else if (countActive) {
                conversationsQuery.containsAll("acceptedParticipantIds", [user.id]);
            }

            var deletedMessageQuery = new Parse.Query(RoomMessage);
            deletedMessageQuery.containsAll('deletedForUsers', [user]);
            lastMessageQuery.doesNotMatchQuery('lastMessage', deletedMessageQuery);

            conversationsQuery.count(
                {
                    success: function(count) {
                        // console.log('getUnreadConversationsCount for user ' + user.get('nickname') + " is " + count);
                        handler({ 'count': count, 'success': true });
                    },
                    error: function(error) {
                        handler({ success: false, 'error': 'Error while counting' });
                    }
                });
        }, function() {
            handler({ 'success': false });
        });
    });

    clientSocket.on('interactWithLikableObject', function(request, handler) {
        Parse.Cloud.useMasterKey();
        var parentId = request.parentId;
        var parentClassName = request.parentClassName;
        var likeClassName = request.likeClassName;
        var shouldLike = request.shouldLike;
        var userId = request.userId;
        var cloudFuncName = "getLikeStatusForObject";

        if (shouldLike) {
            cloudFuncName = "likeObject"
        }

        var params = {
            'likerId': userId,
            'parentId': parentId,
            'parentClassName': parentClassName,
            'likeClassName': likeClassName
        };
        Parse.Cloud.run(cloudFuncName, params).then(function(result) {
            if (handler) {
                handler(result);
            }
        });
    });
});

var RoomMessage = Parse.Object.extend("RoomMessage");
var Conversation = Parse.Object.extend("Conversation");

function storePrivateMessageToParse(userId, messageText, roomId, recieverId, senderNickname) {
    Parse.Cloud.useMasterKey();

    console.log("storing to parse");
    var timestamp = new Date();
    var roomMessage = new RoomMessage();

    roomMessage.set("messageText", messageText);
    roomMessage.set("senderIdentifier", userId);
    roomMessage.set("sentAt", timestamp);
    roomMessage.set("roomId", roomId);
    roomMessage.set("viewed", false);
    roomMessage.set("recipientId", recieverId);
    roomMessage.set("senderNickname", senderNickname);

    roomMessage.save(null, {
        success: function(roomMessage) {
            // Execute any logic that should take place after the object is saved.
            console.log('New object created with objectId: ' + roomMessage.id);

            var query = new Parse.Query(Conversation);
            query.equalTo("objectId", roomId);
            console.log(query);
            query.find({
                success: function(results) {
                    var conversation = results[0];
                    console.log(results);
                    console.log("results");

                    if (conversation) {
                        conversation.set("lastMessage", roomMessage);
                        conversation.addUnique("acceptedParticipantIds", userId);
                        console.log(conversation["acceptedParticipantIds"] + " ACCEPD|TE");
                        conversation.save(null, {
                            success: function(object) {
                                console.log("object saved");
                                console.log("conversationUpdated " + recieverId);
                                io.to(roomId).emit("conversationUpdated", roomId);
                                sendPushFromMessage(roomMessage);
                            },
                            error: function(object, error) {
                                console.log(error);
                                console.log("object not saved");
                            }
                        });
                    }

                },
                error: function(error) {

                }
            });

        },
        error: function(roomMessage, error) {
            // Execute any logic that should take place if the save fails.
            // error is a Parse.Error with an error code and message.
            alert('Failed to create new object, with error code: ' + error.message);
        }
    });
}

function sendPushFromMessage(message) {
    Parse.Cloud.useMasterKey();
    Parse.Push.send({
        channels: [message.get("recipientId")],
        data: {
            category: "PRIVATE_MESSAGE",
            channel: message.get("roomId"),
            alert: message.get("senderNickname") + ": " + message.get("messageText"),
            pushType: "PRIVATE_MESSAGE",
            conversationId: message.get("roomId"),
            recieverId: message.get("recipientId")
        }
    }, {
        useMasterKey: true,
        success: function() {
            // Push was successful
            console.log("successful push to " + message.get("recipientId"));
        },
        error: function(error) {
            // Handle error
            console.log("push error " + JSON.stringify(error));
        }
    });

}

function sendNeedupdateForBar(barId) {
    io.emit("barParticipantsUpdate", barId);
}

const getParseUser = (userId, success, error) => {
    const query = new Parse.Query(Parse.User);
    query.equalTo("objectId", userId);
    query.first({ success, error });
};

const getParseUserBySocketId = (socketId, success, error) => {
    const query = new Parse.Query(Parse.User);
    query.contains('socketIds', socketId);
    query.first({ success, error });
};

function recountBarRatings() {
    var query = new Parse.Query(Bar);
    query.find({
        success: function(bars) {
            for (var i = 0; i < bars.length; i++) {
                console.log("RECOUNT " + i);
                var BarVisit = Parse.Object.extend("BarVisit");
                var visitsQuery = new Parse.Query(BarVisit);
                visitsQuery.equalTo("bar", bars[i]);
                visitsQuery.exists("secondsSpent");
                visitsQuery.doesNotExist("reedemed");

                visitsQuery.find({
                    success: function(results) {
                        var sum = 0;
                        var previousSum = bar.get('timeSpent');
                        for (var j = 0; j < results.length; j++) {
                            var visit = results[j];
                            visit.set("reedemed", true);
                            sum = sum + visit.get("secondsSpent");
                            visit.save();
                            console.log("Time spent in bar no " + i + " " + visit.get("secondsSpent"));
                            console.log("Sum: " + sum);
                        }

                        if (previousSum != null) {
                            sum = (sum + previousSum) / 2;
                        }

                        console.log("Sum after loop: " + sum);
                        bar.set("timeSpent", sum);
                        bar.save();
                    }
                });

            }

        }
    });
}

// Parse cloud triggers
Parse.Cloud.afterSave("Note", function(request) {
    var noteId = request.object.id;
    var barId = request.object.get('barId');
    if (request.object.existed() == false) {
        io.to(barId).emit("barNoteCreated", { "barId": barId, "noteId": noteId });
        io.to(FavBarPrefix + barId).emit("barNoteCreated", { "barId": barId, "noteId": noteId });
        getBarWithId(barId, function(bar) {
            var likersQuery = new Parse.Query(Parse.User);
            likersQuery.containsAll("favoriteBarsIds", [barId]);

            var pushQuery = new Parse.Query(Parse.Installation);
            pushQuery.matchesKeyInQuery("channels", "objectId", likersQuery);
            var barName = bar.get('name');
            // Send push notification to query

            Parse.Push.send({
                where: pushQuery,
                data: {
                    category: "NEW_NOTE",
                    alert: "New note in " + barName,
                    pushType: "NEW_NOTE",
                    noteId: noteId,
                    barId: barId,
                    barName: barName
                }
            }, {
                useMasterKey: true,
                success: function() {
                    // Push was successful
                    console.log("PUSHED afterSave");
                },
                error: function(error) {
                    // Handle error
                    console.log("PUSH error");
                }
            });
        }, function(error) {

        });

    }
});

function getBarWithId(barId, successHandler, errorHandler) {
    var barQuery = new Parse.Query(Bar);
    barQuery.equalTo('objectId', barId);
    barQuery.first({
        success: function(bar) {
            successHandler(bar);
        },
        error: function(error) {
            errorHandler(error);
        }
    });
}

function getLikersOfBarQuery(bar) {
    var favsQuery = new Parse.Query(Favorite);
    favsQuery.equalTo('parent', bar);
    favsQuery.include('liker');

    var likersQuery = new Parse.Query(Parse.User);
    likersQuery.matchesQuery(favsQuery);
    return likersQuery;
}

Parse.Cloud.afterDelete("Favorite", function(request) {
    getUserSocketAfterFavoriteTrigger(request.object, function(socket, liker, bar) {
        liker.remove('favoriteBarsIds', bar.id).save();
        socket.leave(FavBarPrefix + bar.id);
    });
});

Parse.Cloud.afterSave("Favorite", function(request) {
    getUserSocketAfterFavoriteTrigger(request.object, function(socket, liker, bar) {
        liker.addUnique('favoriteBarsIds', bar.id).save();
        socket.join(FavBarPrefix + bar.id);
    });
});

function getUserSocketAfterFavoriteTrigger(favorite, compleiton) {
    var liker = favorite.get('liker');
    liker.fetch({
        success: function(liker) {
            var socketId = liker.get('socketId');
            var bar = favorite.get('parent');
            bar.fetch({
                success: function(bar) {
                    var socket = getSocketWithId(socketId);
                    if (socket != null) {
                        compleiton(socket, liker, bar);
                    }
                }
            });
        }
    });
}

Parse.Cloud.define('deleteConversation', function(request, response) {
    console.log("deleteConversation called");
    var user = request.user;
    var conversationId = request.params.conversationId;
    var messagesQuery = new Parse.Query(RoomMessage);
    console.log("deleteConversation before messagesQuery");

    messagesQuery.equalTo("roomId", conversationId);
    var i = 0;
    messagesQuery.count({
            success: function(count) {
                console.log("deleteConversation count successfull " + count);
                messagesQuery.each(function(message) {
                    console.log("deleteConversation message no " + i);
                    message.addUnique("deletedForUsers", user);
                    message.save().then(function() {
                        console.log("deleteConversation message saved " + i);
                        i++;
                        console.log("deleteConversation message iterated " + i);
                        if (i == count) {
                            console.log("deleteConversation message (i == count)");
                            response.success();
                        }
                    });
                });
            },
            error: function(error) {
                response.error(error);
            }
        }
    );
});

const barRatingJob = new CronJob('00 30 00 * * 1-7',
    recountBarRatings,
    () => {
    },      // This function is executed when the job stops
    true,   // Start the job right now
    null    // Time zone of this job
);

const rechechUsersJob = new CronJob('*/1 * * * *', recheckAllUsers, () => {}, true, null);

// reload server it's for pm2
process.on('SIGINT', () => {
    console.log('\nTODO: Chat process kill.\n');
    process.exit(0);
});

http.listen(3001, () => console.log('Listening on *:3001'));

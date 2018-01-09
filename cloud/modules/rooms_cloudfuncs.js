var BarRoom = Parse.Object.extend("BarRoom");
var Bar = Parse.Object.extend("Bar");
var BarVisit = Parse.Object.extend("BarVisit");

Parse.Cloud.useMasterKey();

Parse.Cloud.define('visitBar', (request, response) => {
    console.log('Parse.Cloud -> running visitBar');
    const user = request.user;
    const userId = request.params.userId || user.id;
    const barId = request.params.barId;

    const visitFunc = (response, barId, userId) =>
        visitBar(barId, userId, (barRoom) =>
            response.success(barRoom), (errorMessage) =>
            response.error(errorMessage));

    leaveBar(barId, userId,
        () => visitFunc(response, barId, userId),
        (errorMessage) => visitFunc(response, barId, userId));
});

Parse.Cloud.define('leaveBar', (request, response) => {
    console.log('Parse.Cloud -> running leaveBar');
    const user = request.user;
    const userId = request.params.userId || user.id;
    const barId = request.params.barId;

    leaveBar(barId, userId,
        () => response.success(barId),
        (errorMessage) => response.error(errorMessage));
});

Parse.Cloud.define('leaveAllRooms', function(request, response){
    var user = request.user;
    var userId = request.params.userId;

    if (userId == null) {
        userId = user.id;
    }

    findUserWithId(userId, function(user){
        findRoomsWithUser(user, function(rooms){

            for (var index = 0; index < rooms.length; index++) {
                var room = rooms[index];
                room.remove("participants", user);
            }

            Parse.Object.saveAll(rooms, {success: function(objects){
                response.success(objects);
            }, error: function(error){
                response.error(error);
            }});

            if (rooms.length == 0) {
                response.success("No Rooms");
            }

        }, function(errorMsg){
            response.error(errorMsg);
        });
    }, function(){
        response.error("userIsUndefined");
    });
});

Parse.Cloud.define('visitRoom', function(request, response) {
    var roomId = request.params.roomId;
    var user = request.user;
    var userId = request.params.userId;

    if (userId == null) {
        userId = user.id;
    }

    var afterLeaveCode = function(roomId, user, response) {
        findRoomWithId(roomId, function(room) {
        room.addUnique('participants', user);
        room.save(null, {
                success: function() {
                    user.set('currentRoomId', room.id);
                    user.save().then(function() {
                        response.success(room);
                    });
                },
                error: function() {
                    response.error("barRoomSaveError");
                }
            });
    }, function(){
        response.error("barRoomNotFound");
    });
}

    findUserWithId(userId, function(user){
        Parse.Cloud.run('leaveAllRooms', {'userId': user.id}).then(function(){
            afterLeaveCode(roomId, user, response);
        });
    }, function(){
        response.error('userIsUndefined');
    });
});

Parse.Cloud.define('leaveRoom', function(request, response) {
    var roomId = request.params.roomId;
    var user = request.user;
    var userId = request.params.userId;

    if (userId == null) {
        userId = user.id;
    }

    findUserWithId(userId, function(user){
            findRoomWithId(roomId, function(room) {
            removeUserFromRoom(room, user).save(null, {
                    success: function() {
                        response.success(room);
                    },
                    error: function() {
                        response.error("barRoomSaveError");
                    }
                });
        }, function(){
            response.error("barRoomNotFound");
        });
    }, function() {
        response.error("userIsUndefined");
    });
});

Parse.Cloud.define('finishVisit', function(request, response){
    var visit = request.params.visit;
    finishVisit(visit);
});


// HEPLING METHODS
function visitBar(barId, userId, successHandler, errorHandler) {
    findUserWithId(userId, function(user){
        findBarWithId(barId, function(bar){
            var visit = new BarVisit();
            visit.set('bar', bar);
            visit.set('barId', bar.id);
            visit.set('visitor', user);
            var currentDate = new Date();
            visit.set('visitDate', currentDate);
            visit.save();
            user.set('currentBar', bar);
            user.set('lastVisit', visit);
            Parse.Cloud.run('leaveAllRooms', {"userId": userId }).then(function(){
                findUsersRoom(user, bar, function(barRoom) {
                    barRoom.addUnique('participants', user);
                    barRoom.save(null, {
                        success: function() {
                            user.set('currentRoomId', barRoom.id);
                            user.save();
                            successHandler(barRoom);
                        },
                        error: function() {
                            errorHandler("barRoomSaveError");
                        }
                    });
                }, function(){
                    var barRoom = new BarRoom();
                    barRoom.addUnique('participants', user);
                    barRoom.set('bar', bar);
                    barRoom.set('masterUser', user);
                    barRoom.save(null, {
                        success: function() {
                            user.set('currentRoomId', barRoom.id);
                            user.save();
                            successHandler(barRoom);
                        },
                        error: function() {
                            errorHandler("barRoomSaveError");
                        }
                    });
                });
            });

        },
        function() {
            errorHandler("Bar not found");
        });
    }, function(){
        errorHandler("userIsUndefined");
    });
}

function leaveBar(barId, userId, successHandler, errorHandler) {
    console.log("leaveBar barId: " + barId + "userId: " + userId)
    findUserWithId(userId, function(user){
            findBarWithId(barId, function(bar){
            var lastVisit = user.get('lastVisit');
            if (lastVisit) {
                finishVisit(lastVisit);
            }

            findUsersRoom(user, bar, function(barRoom) {
                removeUserFromRoom(barRoom, user).save(null, {
                    success: function() {
                        user.unset('currentBar');
                        user.save().then(function(){
                            successHandler();
                        });
                    },
                    error: function() {
                        errorHandler("barRoomSaveError");
                    }
                });
            }, function(){
                errorHandler("ERROR");
            });
        },
        function() {
            errorHandler("Bar not found");
        });
    }, function() {
        errorHandler("userIsUndefined");
    });
}

function finishVisit(visit) {
    if (!visit.get('leaveDate')) {
        var t1 = visit.get("visitDate");
        var t2 = new Date();
        var dif = t1.getTime() - t2.getTime();
        visit.set("leaveDate", t2);

        var Seconds_from_T1_to_T2 = dif / 1000;
        var Seconds_Between_Dates = Math.abs(Seconds_from_T1_to_T2);
        visit.set("secondsSpent", Seconds_Between_Dates);
        visit.save();
    }
}

function findUsersRoom(user, bar, successHandler, errorHandler) {
    var query = new Parse.Query(BarRoom);
    query.equalTo("masterUser", user);
    query.equalTo("bar", bar);
    query.include('bar');
    handleQuery(query, successHandler, errorHandler);
}

function findRoomWithId(roomId, successHandler, errorHandler) {
    var query = new Parse.Query(BarRoom);
    query.equalTo("objectId", roomId);
    query.include('bar');
    handleQuery(query, successHandler, errorHandler);
}

function findRoomsWithUser(user, successHandler, errorHandler) {
    var query = new Parse.Query(BarRoom);
    query.containsAll("participants", [user]);
    query.include('participants');
    handleArrayQuery(query, successHandler, errorHandler);
}

function findBarWithId(barId, successHandler, errorHandler) {
    var query = new Parse.Query(Bar);
    query.equalTo("objectId", barId);
    handleQuery(query, successHandler, errorHandler);
}

function findUserWithId(userId, successHandler, errorHandler) {
    var query = new Parse.Query(Parse.User);
    query.equalTo("objectId", userId);
    query.include('lastVisit');
    query.include('currentBar');
    handleQuery(query, successHandler, errorHandler);
}

function handleQuery(query, successHandler, errorHandler) {
    query.find({
    success: function(results) {
        var object = results[0];
        if (object) {
            successHandler(object);
        }   else {
            errorHandler();
        }
    },
    error: function(error) {
        errorHandler()
        }
    });
}

function handleArrayQuery(query, successHandler, errorHandler) {
    query.find({
    success: function(results) {
        successHandler(results);
    },
    error: function(error) {
        errorHandler()
        }
    });
}

function removeUserFromRoom(barRoom, userToRemove) {
    console.log("removeUserFromRoom")
    var usersInRoom = barRoom.get('participants');
    barRoom.remove('participants', userToRemove);
    userToRemove.unset('currentRoomId');
    userToRemove.save();
    return barRoom;
}

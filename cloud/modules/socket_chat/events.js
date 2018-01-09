function userInfoBySocket(socket, handler) {
        for (var i=0; i<userList.length; i++) {
          if (userList[i]["id"] == socket.id) {
            if (handler) {
              handler(userList[i]);
            }
          }
  }
}

// User Online timer mechanism
    var timerId = setInterval(function() {
    for (var i=0; i<userList.length; i++) {
      var userInfo = userList[i];
          Parse.Cloud.run('updateUserOnline', { userId: userInfo["userId"], status: userInfo["socket"].connected});
         }
      }, 5000);

io.on('connection', function(clientSocket){
  console.log('a user connected');

  clientSocket.emit("connectedWithId", clientSocket.id);

  clientSocket.on("registerAs", function(userId, handler){
      console.log("registerAs demanded " + clientSocket.id + " as " + userId);
      clientSocket.join(userId);
      Parse.Cloud.run('updateUserOnline', { userId: userId, status: true});
      var userInfo = {};
      var foundUser = false;
      for (var i=0; i<userList.length; i++) {
        if (userList[i]["userId"] == userId) {
          userList[i]["isConnected"] = true
          userList[i]["id"] = clientSocket.id;
          userInfo = userList[i];
          foundUser = true;
          break;
        }
      }

      if (!foundUser) {
        userInfo["id"] = clientSocket.id;
        userInfo["userId"] = userId;
        userInfo["isConnected"] = true;
        userList.push(userInfo);
      }
      
      userInfo["socket"] = clientSocket;

      if (handler) {
      	handler(userId);
      }
      // clientSocket.emit("yourIdSir", userId);

      // User online timer
  });

  clientSocket.on('disconnect', function(){
    Parse.Cloud.useMasterKey();

    console.log('user disconnected');

    var userId;
    for (var i=0; i<userList.length; i++) {
      if (userList[i]["id"] == clientSocket.id) {
        userList[i]["isConnected"] = false;
        userId = userList[i]["userId"];
        break;
      }
    }


		var query = new Parse.Query(Parse.User);
		query.equalTo("objectId", userId);
		console.log(query);

		query.find({
		  success: function(results) {
		    

		    var user = results[0];
		    user.unset("currentBarId");
		    user.unset("currentRoomId");
		    user.save(null, {
				  success: function(user) {

				  },
				  error: function(user, error) {

				  }
				});

		  },
		  error: function(error) {
		    alert("Error: " + error.code + " " + error.message);
		  }
		});

  });


  clientSocket.on("notifyBar", function(barId){
    sendNeedupdateForBar(barId);
  });

  clientSocket.on("joinRoom", function(roomId, handler){
    console.log("joinRoom! demanded with id " + roomId);
    var barId = roomId.split("/")[0];
    sendNeedupdateForBar(barId);
    console.log("joinRoom! " + barId);
    var isBarRoom = roomId.split("/")[1];

// If Bar room
    if (isBarRoom) {
      userInfoBySocket(clientSocket, function(userInfo) {
        clientSocket.leave(userInfo["latestBarRoomId"]);
        io.emit("groupRoomLeaved", userInfo["latestBarRoomId"], getUserIdBySocket(clientSocket));
      });

    }

    clientSocket.room = roomId;
    clientSocket.join(roomId);
    findClientsSocketByRoomIdWithHandler(roomId, handler);

    if (isBarRoom) {
      userInfoBySocket(clientSocket, function(userInfo) {
        userInfo["latestBarRoomId"] = roomId;
      });
      io.emit("newRoomParticipant", roomId, getUserIdBySocket(clientSocket));
    }
  });

  clientSocket.on("getUserIdList", function(roomId, handler) {
  	findClientsSocketByRoomIdWithHandler(roomId, handler);
    // findClientsSocketByRoomId(roomId)
  });

  clientSocket.on("leaveRoom", function(roomId){
    clientSocket.leave();
    console.log("leaveRoom! " + roomId + " User Id: " + getUserIdBySocket(clientSocket));
    findClientsSocketByRoomId(roomId);
  });

  clientSocket.on("visitBar", function(barId, userId) {
      io.emit("barVisited", barId, userId);
  });

    clientSocket.on("leaveBar", function(barId, userId) {
      io.emit("barLeaved", barId, userId);
  });


  clientSocket.on('getConnectedUsers', function(handler){
    console.log("getConnectedUsers demanded");
    if (handler) {
    	handler(connectedUsersIds());
    }
    // clientSocket.emit('connectedUsers', connectedUsersIds());
  });

// TODO: - Sdelat messaging
  clientSocket.on('chatMessage', function(roomId, message){
  	clientSocket.join(roomId);
    var currentDateTime = new Date().toLocaleString();
     console.log(message + " <- Message revieved from " + getUserIdBySocket(clientSocket) + " In room " + roomId + " Date: " + currentDateTime);
     var userid = getUserIdBySocket(clientSocket);
     // var privateMessage = roomId.indexOf("/") == -1;
     // if (privateMessage) {
     // 	storeRoomMessageToParse(userid, message, roomId);
     // }
    io.to(roomId).emit("newChatMessage", message, getUserIdBySocket(clientSocket), currentDateTime, roomId, false);
  });

    clientSocket.on('privateMessage', function(recieverId, message, conversationId, senderNickname){
    var currentDateTime = new Date().toLocaleString();
     console.log(message + " <- Private message revieved from " + getUserIdBySocket(clientSocket) + " In conversation " + conversationId + " Date: " + currentDateTime);
     var userid = getUserIdBySocket(clientSocket);
     storeRoomMessageToParse(userid, message, conversationId, recieverId, senderNickname);
    io.to(conversationId).emit("newChatMessage", message, getUserIdBySocket(clientSocket), currentDateTime, conversationId, true);
    io.to(recieverId).emit("newPrivateMessage", message, getUserIdBySocket(clientSocket), currentDateTime, conversationId, true);
  });
});

function storeRoomMessageToParse(userId, messageText, roomId, recieverId, senderNickname) {
    Parse.Cloud.useMasterKey();

	console.log("storing to parse");
	var timestamp = new Date();
	var RoomMessage = Parse.Object.extend("RoomMessage");
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

		var Conversation = Parse.Object.extend("Conversation");
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

  Parse.Push.send({
    channels: [ message.get("recipientId") ],
    data: {
      alert: message.get("senderNickname") + ": " + message.get("messageText"),
      pushType: "PRIVATE_MESSAGE",
      conversationId: message.get("roomId"),
      recieverId: message.get("recipientId")
    }
  }, {
    success: function() {
      // Push was successful
      console.log("successful push to " + message.get("recipientId"));
    },
    error: function(error) {
      // Handle error
      console.log("push error " + error);
    }
  });

}

function sendNeedupdateForBar(barId) {
	io.emit("barParticipantsUpdate", barId);
}

  function getUserIdBySocket(clientSocket) {
    for (var i=0; i<userList.length; i++) {
      if (clientSocket.id == userList[i]["id"]) {
        return userList[i]["userId"];
      }
    }
  }

  function findClientsSocketByRoomId(roomId) {
  io.in(roomId).clients(function(error, clients){
      if (error) throw error;
      console.log(clients); // => [Anw2LatarvGVVXEIAAAD]
      var userIds = [];
      for (var i=0; i<userList.length; i++) {
          for (var j=0; j<clients.length; j++) {
            if (clients[j] == userList[i]["id"] && userList[i]["isConnected"] == true) {
              userIds.push(userList[i]["userId"]);
            }
          }
      }
      io.to(roomId).emit("roomClientsUpdated", userIds, roomId);
    });


}

  function findClientsSocketByRoomIdWithHandler(roomId, handler) {
  io.in(roomId).clients(function(error, clients){
      if (error) throw error;
      console.log("clients " + clients);
      var userIds = [];
      for (var i=0; i<userList.length; i++) {
          for (var j=0; j<clients.length; j++) {
            // if (clients[j] == userList[i]["id"] && userList[i]["isConnected"] == true) {
              if (clients[j] == userList[i]["id"]) {
  
              userIds.push(userList[i]["userId"]);
            }
          }
      }
      console.log("USERIDS " + userIds);
      if (handler) {
      	console.log(clients);
      	console.log(userIds);
      	console.log("Handler call");
      	handler(userIds);
      }
    });
}

  function connectedUsersIds() {
    var connected = [];
      for (var i=0; i<userList.length; i++) {
        if (userList[i]["isConnected"] == true) {
          connected.push(userList[i]["userId"])
        }
      }

      return connected
  }


  function getParseUser(userId, handler) {
		var query = new Parse.Query(Parse.User);
		query.equalTo("objectId", userId);
		query.find({
		  success: function(results) {
		    var user = results[0];
		    handler(user);
		  },
		  error: function(error) {
        handler();
		  }
		});
  }

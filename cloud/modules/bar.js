
var Bar = Parse.Object.extend("Bar");
var Favorite = Parse.Object.extend("Favorite");

Parse.Cloud.define('getFavoriteBars', function(request, response){
	var userId = request.params.userId;

	if (userId == null) {
		response.error("User id is undefined");
	}
	var userQuery = new Parse.Query(Parse.User);
	userQuery.equalTo("objectId", userId);
	userQuery.first({
		success: function(user) {
			getFavoriteBarsOfUser(user, function(bars){
				response.success(bars);
			}, function(){
				response.error("Fav bars fetch error");
			});
		},
		error: function(error) {
			response.error("User not found");
		}
	});

});

function getFavoriteBarsOfUser(user, successHandler, errorHandler) {
	var favsQuery = new Parse.Query(Favorite);
	favsQuery.equalTo('liker', user);
	favsQuery.include('parent');
	favsQuery.find({
		success: function(favs) {
			var bars = [];
			for (var index = 0; index < favs.length; index++) {
				var fav = favs[index];
				var bar = fav.get('parent');
				if (bar) {
					bars.push(bar);
				}
			}
			successHandler(bars);
		},
		error: function() {
			errorHandler(error);
		}
	});
}

function getLikersOfBar(bar, successHandler, errorHandler) {
	var favsQuery = new Parse.Query(Favorite);
	favsQuery.equalTo('parent', bar);
	favsQuery.include('liker');
	favsQuery.find({
		success:function(favs) {
			var users = [];
			favs.forEach(function(element) {
				users.push(element);
			}, this);
			successHandler(users);
		},
		error: function(error) {
			errorHandler(error);
		}
	});
}

Parse.Cloud.define('participantsOfRooms', function(request, response) {
	var roomIds = request.params.roomIds;
	var user = request.user;
	getParticipantsOfRooms(roomIds, user, function(results) {
		response.success({results});
	});
});

Parse.Cloud.define('getBarRooms', function(request, response) {
	var barId = request.params.barId;
	var user = request.user;
	getBarRoomsWithParticipants(barId, user, function(results) {
		response.success(results);
	});
});

Parse.Cloud.define('getMasters', function(request, response) {
	var barId = request.params.barId;
	getBarRooms(barId, function(results) {
		response.success(results);
	});
});

function getBarRoomsWithParticipants(barId, user, handler) {
		getBarRooms(barId, function(results) {
			var resultsDictionary = {};
			var roomIds = [];
			for (var i = 0; i < results.length; i++) {
				var roomId = results[i].get('currentRoomId');
				roomIds.push(roomId);
			}


		getParticipantsOfRooms(roomIds, user, function(results) {
			handler(results);
		});
	});
}

function getBarRooms(barId, handler) {
	var mainUsersQuery = new Parse.Query('User');
	mainUsersQuery.equalTo("currentBarId", barId);
	mainUsersQuery.equalTo('roomOwner', true);
	mainUsersQuery.ascending("objectId");
	mainUsersQuery.find({
		success: function(users) {
			handler(users);
		},
		error: function() {
			handler(null);
		}
	});
}


function getParticipantsOfRooms(roomIds, user, handler) {
	// var finishedTasks = 0;
	var results = {};
	var roomIds = roomIds.sort();
	if (roomIds.length == 0) {
		handler(results);
		console.log("getParticipantsOfRooms with no results");
	}
	var usersInRoomQuery = new Parse.Query('User');
	usersInRoomQuery.containedIn('currentRoomId', roomIds);
	usersInRoomQuery.ascending("objectId");
	// usersInRoomQuery.equalTo("online", true);
	usersInRoomQuery.find({
	      	success: function(users) {
				users.forEach(function(user) {
					var currentRoomId = user.get('currentRoomId');
					var usersInRoomArray = results[currentRoomId];
					if (!usersInRoomArray) {
						usersInRoomArray = [];
					}
					usersInRoomArray.push(user);
					results[currentRoomId] = usersInRoomArray;
				}, this);
				handler(results);
	      	},
			error: function() {
				handler(results);
			}
	})
}








Parse.Cloud.define('likeObject', function(request, response) {
	Parse.Cloud.useMasterKey();
	var userId = request.params.likerId;
	var parentId = request.params.parentId;
	var parentClassName = request.params.parentClassName;
	var likeClassName = request.params.likeClassName;

	var userQuery = new Parse.Query(Parse.User);
      userQuery.equalTo("objectId", userId);
      userQuery.find({
        success: function(results) {
          var user = results[0];

			var query = new Parse.Query(parentClassName);
				query.equalTo("objectId", parentId);
				query.find({
				success: function(results) {
						var note = results[0];
						var isLikedQuery = allLikesQuery(note, likeClassName);
						isLikedQuery.equalTo("liker", user);
						isLikedQuery.find({
							success: function(results) {
								var like = results[0];
								if (like) {
									like.destroy({
									success: function(myObject) {
										countAllLikesWithHandler(note, likeClassName, function(count) {
										response.success({"noteId": note.id, "count": count, "isLikedByMe" : false});
										setLikesCountAndSave(note, count);
										}, function() {
											response.error("like event failed");
										});
									},
									error: function(myObject, error) {
										// The delete failed.
										// error is a Parse.Error with an error code and message.
										response.error("like event failed");
									}
							});
								}	else {
								// Add like
								var Like = Parse.Object.extend(likeClassName);
							var like = new Like();
							like.set("liker", user);
							like.set("likerId", user.id);
							like.set("parent", note);
                            like.set("recipientId", note.id);
							like.save(null, {
								success: function(object) {
									countAllLikesWithHandler(note, likeClassName, function(count) {
									response.success({"noteId": note.id, "count": count, "isLikedByMe" : true});
									setLikesCountAndSave(note, count);
									}, function() {
										response.error("like event failed");
									});

								},
								error: function(object, error) {
									response.error("like event failed");
								}
							});
								}
							},
							error: function() {
								response.error("like event failed");
							}
						});
					},
					error: function() {
						response.error("like event failed");
					}
				});

						

        }
      });
});



Parse.Cloud.define('getLikeStatusForObject', function(request, response) {
	Parse.Cloud.useMasterKey();
	var userId = request.params.likerId;
	var parentId = request.params.parentId;
	var parentClassName = request.params.parentClassName;
	var likeClassName = request.params.likeClassName;

	var userQuery = new Parse.Query(Parse.User);
      userQuery.equalTo("objectId", userId);
      userQuery.find({
        success: function(results) {
          var user = results[0];

			var query = new Parse.Query(parentClassName);
				query.equalTo("objectId", parentId);
				query.find({
				success: function(results) {
						var note = results[0];
						var isLikedQuery = allLikesQuery(note, likeClassName);
						isLikedQuery.equalTo("liker", user);
						isLikedQuery.find({
							success: function(results) {
								var like = results[0];
								if (like) {
									countAllLikesWithHandler(note, likeClassName, function(count) {
									response.success({"noteId": note.id, "count": count, "isLikedByMe" : true});
									}, function() {
										response.error("like event failed");
									});

								}	else {
								// Add like
									countAllLikesWithHandler(note, likeClassName, function(count) {
									response.success({"noteId": note.id, "count": count, "isLikedByMe" : false});
									setLikesCountAndSave(note, count);
									}, function() {
										response.error("like event failed");
									});
								}
							},
							error: function() {
								response.error("like event failed");
							}
						});
					},
					error: function() {
						response.error("like event failed");
					}
				});

						

        }
      });
});

var addCoinEvery = 3;
var addCoinsTriggerCount = 10;

Parse.Cloud.afterSave("UserLike", function(request) {
	var like = request.object;

	var likedUser = like.get('parent');
	
	findUserWithId(likedUser.id, function(likedUser){
		
		var likesCap = likedUser.get('likesCap');
		if (likesCap == null) {
			likesCap = 0;
		}
		if(like.existed() == false) {
			countAllLikesWithHandler(likedUser, "UserLike", function(count) {
				if (count > likesCap) {
					likedUser.set('likesCap', count);
					if (count % addCoinEvery == 0) {
						var coins = likedUser.get('coins');
						if (coins == null) {
							coins = 0;
						}
						likedUser.set('coins', addCoinsTriggerCount + coins);
						likedUser.save();
					} 
				}
			}, function() {
				
			});

		}
	}, function(){

	});

})

function  allLikesQuery(parent, className) {
      var likesQuery = new Parse.Query(className);
      likesQuery.equalTo("parent", parent);
      return likesQuery
}


function countAllLikesWithHandler(parent, likeClassName, successHandler, errorHandler) {
		var allLikes = allLikesQuery(parent, likeClassName);

		allLikes.count({
		  success: function(count) {
		    // The count request succeeded. Show the count
	    		if (successHandler) {
	    			successHandler(count);
	    		}
		  },
		  error: function(error) {
		    // The request failed
	    		if (errorHandler) {
	    			errorHandler();
	    		}
		  }
		});
}

function setLikesCountAndSave(likable, count) {
	likable.set("likeCount", count);
    likable.save(null, {
	  success: function(object) {

	  },
	  error: function(object, error) {

	  }
	});
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

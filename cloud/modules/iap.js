var Gift = Parse.Object.extend('Gift');
var GoldLike = Parse.Object.extend('GoldLike');
var goldLikeCost = 6;


Parse.Cloud.define('AddCoinsToUser', function(request, response) {
    if (!request.user) {
        var errorMessage = 'Invalid user. You should be authorized'; 
        console.error(errorMessage);
        response.error(errorMessage);
        return;
    }

    Parse.Cloud.useMasterKey();
    var user = request.user;
    var amount = request.params.amount;

    if (user.get('coins') == undefined) {
        user.set('coins', amount);
        user.save(null, {
            success: function(object) {
                response.success(amount);
            }, error: function() {
                response.error('Error while saving user');
            }
        })
    } else {
        var current = user.get('coins');
        var newAmount = current + amount;
        user.set('coins', newAmount);
        user.save(null, {
            success: function(object) {
                console.log('Successfully saved user with new amount of coins: ' + newAmount);
                response.success(newAmount);
            }, error: function() {
                var errorMessage = 'Error while saving user';
                console.error(errorMessage);
                response.error(errorMessage);
            }
        });
    }
});

Parse.Cloud.define('SendGiftToUser', function(request, response) {
    if (!request.user) {
        var errorMessage = 'Invalid user. You should be authorized'; 
        console.error(errorMessage);
        response.error(errorMessage);
        return;
    }

    Parse.Cloud.useMasterKey();
    var user = request.user;
    var receiverId = request.params.receiverId;
    var giftId = request.params.giftId;

    var query = new Parse.Query('GiftItemType');
    query.equalTo('objectId', giftId);
    query.first({
        success: function(gift) {
            console.log('Successfully found gift');
            var userQuery = new Parse.Query('User');
            userQuery.equalTo('objectId', receiverId);
            userQuery.first({
                success: function(receiver) {
                    console.log('Successfully found user');
                    var coins = user.get('coins');
                    var cost = gift.get('cost');
                    if (cost <= coins) {
                        user.set('coins', coins - cost);
                        user.save();

                        var newGift = new Gift();
                        console.log('Created Gift');
                        newGift.set('item', gift);
                        newGift.set('grantor', user);
                        console.log('Added gift item to gift');
                        newGift.set('recipientId', receiverId);
                        console.log('Added recipientId to gift');
                        newGift.save(null, {
                            success: function(object) {
                                console.log('Successfully saved new gift');
                                response.success(newGift);
                            }, error: function() {
                                var errorMessage = 'Error saving new gift';
                                console.error(errorMessage);
                                response.error(errorMessage);
                            }
                        });
                    } else {
                        var errorMessage = 'Not enough coins to purchase this item';
                        console.error(errorMessage);
                        response.error(errorMessage);
                    }
                }, error: function() {
                    var errorMessage = 'Error obtaining user from server';
                    console.error(errorMessage);
                    response.error(errorMessage);
                }
            });
        }, error: function() {
            var errorMessage = 'Error obtaining gift from server'
            console.error(errorMessage);
            response.error(errorMessage);
        }
    });
});


Parse.Cloud.define('SendGoldLikeToUser', function(request, response) {
    if (!request.user) {
        var errorMessage = 'Invalid user. You should be authorized'; 
        console.error(errorMessage);
        response.error(errorMessage);
        return;
    }

    Parse.Cloud.useMasterKey();
    var user = request.user;
    var receiverId = request.params.receiverId;

    var userQuery = new Parse.Query('User');
    userQuery.equalTo('objectId', receiverId);
    userQuery.first({
        success: function(receiver) {
            var coins = user.get('coins');
            var cost = goldLikeCost;
            if (cost <= coins) {
                user.set('coins', coins - cost);
                user.save();
                var goldLike = new GoldLike();
                goldLike.set('liker', user);
                goldLike.set('recipientId', receiverId);
                goldLike.set('recipient', receiver);
                goldLike.save(null, {
                    success: function(object) {
                        response.success(goldLike);
                    }, error: function() {
                        var errorMessage = 'Error saving new gift';
                        console.error(errorMessage);
                        response.error(errorMessage);
                    }
                });
            } else {
                var errorMessage = 'Not enough coins to purchase this item';
                console.error(errorMessage);
                response.error(errorMessage);
            }
        }, error: function() {
            var errorMessage = 'Error obtaining user from server';
            console.error(errorMessage);
            response.error(errorMessage);
        }
    });
});

Parse.Cloud.beforeSave("GoldLike", function(request, response) {
    Parse.Cloud.useMasterKey();
    var goldLike = request.object;
    var recipientId = goldLike.get("recipientId");
    var userQuery = new Parse.Query('User');
    userQuery.equalTo('objectId', recipientId);
    userQuery.first({
        success: function(receiver) {
            response.success();
        },
        error: function(error){
            response.error(error);
        }});
  
});


Parse.Cloud.afterSave("GoldLike", function(request) {
    Parse.Cloud.useMasterKey();
    var goldLike = request.object;
    var recipientId = goldLike.get("recipientId");
    var userQuery = new Parse.Query('User');
    userQuery.equalTo('objectId', recipientId);
    userQuery.first({
        success: function(receiver) {
            var goldLikesQuery = new Parse.Query('GoldLike');
            goldLikesQuery.equalTo('recipientId', recipientId);
            goldLikesQuery.count({
                success: function(count) {
                    if (count == null) {
                        count = 0;
                    }
                    receiver.set("goldLikesCount", count);
                    receiver.save();
                }
            });
        },
        error: function(error){

        }});
  
});


Parse.Cloud.afterSave("Gift", function(request) {
    Parse.Cloud.useMasterKey();
    var gift = request.object;
    var recipientId = gift.get("recipientId");
    var userQuery = new Parse.Query('User');
    userQuery.equalTo('objectId', recipientId);
    userQuery.first({
        success: function(receiver) {
            var giftsQuery = new Parse.Query('Gift');
            giftsQuery.equalTo('recipientId', recipientId);
            giftsQuery.count({
                success: function(count) {
                    if (count == null) {
                        count = 0;
                    }
                    receiver.set("giftsCount", count);
                    receiver.save();
                }
            });
        },
        error: function(error){

        }});
  
});
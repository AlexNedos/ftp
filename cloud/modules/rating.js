Parse.Cloud.define('getAvarageRating', function(request, response) {
    var barId = request.params.barId;
    var query = new Parse.Query('Rate');
    query.equalTo('barId', barId);
    query.find({
        success: function(results) {
            console.log('Successfully read rates from server');
            var sum = 0;
            for (var i=0; i < results.length; ++i) {
                sum += results[i].get('value');
            }
            response.success(sum / results.length);
        }, error: function() {
            var errorMessage = 'Error obtaining rates from server';
            console.log(errorMessage);
            response.error(errorMessage);
        }
    });
});

function reseetBarRating(rate, completion) {
    var barId = rate.get('barId')
    var query = new Parse.Query('Bar');
    query.equalTo('objectId', barId);
    query.first({
        success: function(bar) {
            console.log('Successfully found bar');
            var query = new Parse.Query('Rate');
            query.equalTo('barId', barId);
            query.find({
                success: function(objects) {
                    console.log('Successfully found rates for bar');
                    var sum = 0
                    var length = objects.length;
                    for (var i = 0; i < objects.length; ++i) {
                        if (objects[i].id != rate.id) {
                            sum += objects[i].get('value');
                        } else {
                            length -= 1;
                        }
                    }
                    console.log('sum ' + sum + ' count ' + length);

                    completion(bar, sum, length);
                }, error: function() {
                    console.log('Error obtaining rates from server');
                }
            });
        }, error: function() {
            console.log('Error obtaining bar from server');
        }
    });
}

Parse.Cloud.beforeSave('Rate', function(request, response) {
    reseetBarRating(request.object, function(bar, rating, count) {
        console.log('rating ' + rating + ' rate ' + request.object.get('value') + ' count ' + count);
        var newRating = (rating + request.object.get('value')) / (count + 1);
        bar.set('rating', newRating);
        bar.save(null, {
            success: function(object) {
                console.log('Successfully saved bar with rating ' + newRating);
                response.success();
            }
        });
    });
});

Parse.Cloud.beforeDelete('Rate', function(request, response) {
    reseetBarRating(request.object, function(bar, rating, count) {
        var newRating = rating / count;
        bar.set('rating', newRating);
        bar.save(null, {
            success: function(object) {
                console.log('Successfully saved bar with rating ' + newRating);
                response.success();
            }
        });
    });
});
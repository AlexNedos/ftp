Parse.Cloud.define('updateUserOnline', (request, response) => {
    const userId = request.params.userId;
    const status = request.params.status;
    const query = new Parse.Query(Parse.User);
    
    query.include('currentBar');
    query.include('lastVisit');
    query.include('socketIds');
    query.equalTo("objectId", userId);
    
    query.first({
        success: (user) => {
            if (status === false) {
                if (!user.get('socketIds').length) {
                    if (user.get('currentBar')) {
                        Parse.Cloud.run('leaveBar', { barId: user.get('currentBar').id, userId: user.id });
                    }
                    // user.unset('socketId');
                    user.set('online', false);
                    user.save(null, { useMasterKey: true });
                } else {
                    console.log("This case should not be happen, but for some unknown reason it is happens!");
                }
            } else {
                user.set("online", status);
                user.save(null, { useMasterKey: true });
            }
        },
        error: (error) => console.error("updateUserOnline error " + error)
    }, { useMasterKey: true });
});

const url = require('url');

Parse.Cloud.define('resetPassword', function (request, response) {

  const link = request.params.link;
  const newPassword = request.params.newPassword;

  if(!link)
    response.error('The link is required');
  else if(!newPassword || typeof newPassword === 'number')
    response.error('The new password is required and must be string');

  const tokenQuery = url.parse(link);
  const token = tokenQuery.query.match('token=(.*)');

  const userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo("tokenResetPassword", token[1]);
  userQuery.first().then((user) => {
      if(user){
        user.save({
          password: newPassword,
          tokenResetPassword: ''
        }, {
          useMasterKey: true,
          success(){
            response.success("Password changed")
          },
          fail(){
            response.error("Password not saved");
          }
        });
      } else {
        response.error("User not found");
      }
  });
});
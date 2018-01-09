Parse.Cloud.beforeSave("BarRoom", function(request, response) {
  var room = request.object;
  var participants = room.get('participants');
  var count = 0;
  if (participants) {
  	count = participants.length;
  }

  participants.sort(function(a, b) {
  return a.id > b.id;
  });

  room.set("participants", participants);
  room.set('empty', count == 0);
  response.success();
});
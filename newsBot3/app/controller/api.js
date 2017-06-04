var request = require('request');
var rssReader = require('feed-read');
var properties = require('../config/properties.js');
var MongoClient = require('mongodb').MongoClient;
var fs = require('fs');
var logpath = './log.txt';

// if our user.js file is at app/models/user.js
var User = require('../model/user');



exports.tokenVerification = function(req, res) {
  if (req.query['hub.verify_token'] === properties.facebook_challenge) {
    res.send(req.query['hub.challenge']);
  } else {
    res.send('Error, wrong validation token');
  }
}

exports.handleMessage = function(req, res) {
  messaging_events = req.body.entry[0].messaging;
  for (i = 0; i < messaging_events.length; i++) {
    event = req.body.entry[0].messaging[i];
    sender = event.sender.id;
    if (event.message && event.message.text) {
        text = event.message.text;

        normalizedText = text.toLowerCase().replace(' ', '');
        
        // Handle a text message from this sender
        switch(normalizedText) {
          case "/subscribe":
            subscribeUser(sender)
            break;
          case "/unsubscribe":
            unsubscribeUser(sender)
            break;
          case "/subscribestatus":
            subscribeStatus(sender)
            break;
          default:
            callWitAI(text, function(err, intent) {
              handleIntent(intent, text, sender)
            })
          }
      }
    }
  res.sendStatus(200);
}

function handleIntent(intent, text, sender) {
  switch(intent) {
    case "jokes":
      sendTextMessage(sender, "Today a man knocked on my door and asked for a small donation towards the local swimming pool. I gave him a glass of water.")
      break;
    case "greeting":
      sendTextMessage(sender, "Hi!")
      break;
    case "identification":
      sendTextMessage(sender, "I'm Newsbot.")
      break;
    case "restaurant":
      sendTextMessage(sender, "Please tell me your location. send me in latitude/longtitude. Location: 13.708259, 100.519912")
      break;   
    case "near restaurant":
      _getRestaurants(text, sender, function(err, restaurants) {
        if (err) {
          console.log(err);
        } else {
          console.log(sender);
          sendTextMessage(sender, "Here what I found")
          maxRestaurants = Math.min(restaurants.length, 3);
          for (var i=0; i<maxRestaurants; i++) {
            _sendRestaurantMessage(sender, restaurants[i])
          }
        }
      })
      break;         
    case "more news":
      _getArticles(function(err, articles) {
        if (err) {
          console.log(err);
        } else {
          sendTextMessage(sender, "How about these?")
          maxArticles = Math.min(articles.length, 5);
          for (var i=0; i<maxArticles; i++) {
            _sendArticleMessage(sender, articles[i])
          }
        }
      })
      break;
    case "general news":
      _getArticles(function(err, articles) {
        if (err) {
          console.log(err);
        } else {
          sendTextMessage(sender, "Here's what I found...")
          _sendArticleMessage(sender, articles[0])
        }
      })
      break;
    case "local news":
      _getArticles(function(err, articles) {
        if (err) {
          console.log(err);
        } else {
          sendTextMessage(sender, "I don't know local news yet, but I found these...")
          _sendArticleMessage(sender, articles[0])
        }
      })
      break;
    default:
      sendTextMessage(sender, "I'm not sure about that one :/")
      break

  }
}

function subscribeUser(id) {
  // create a new user called chris
  var newUser = new User({
    fb_id: id,
  });

  // call the built-in save method to save to the database
  User.findOneAndUpdate({fb_id: newUser.fb_id}, {fb_id: newUser.fb_id}, {upsert:true}, function(err, user) {
    if (err) {
      sendTextMessage(id, "There wan error subscribing you for daily articles");
    } else {
      console.log('User saved successfully!');
      sendTextMessage(newUser.fb_id, "You've been subscribed!")
    }
  });
}

function unsubscribeUser(id) {
  // call the built-in save method to save to the database
  User.findOneAndRemove({fb_id: id}, function(err, user) {
    if (err) {
      sendTextMessage(id, "There wan error unsubscribing you for daily articles");
    } else {
      console.log('User deleted successfully!');
      sendTextMessage(id, "You've been unsubscribed!")
    }
  });
}

function subscribeStatus(id) {
  User.findOne({fb_id: id}, function(err, user) {
    subscribeStatus = false
    if (err) {
      console.log(err)
    } else {
      if (user != null) {
        subscribeStatus = true
      }
      subscribedText = "Your subscribed status is " + subscribeStatus
      sendTextMessage(id, subscribedText)
    }
  })
}
function deg2rad(deg) { return deg * (Math.PI / 180); }

function getDistanceInKm(lat1, lon1, lat2, lon2) { 
   var R = 6371; 
   var dLat = deg2rad(lat2 - lat1);  
   var dLon = deg2rad(lon2 - lon1);  
   var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);  
   var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
   var d = R * c; 
   return d; 
}

function _getRestaurants(text, sender, callback) {
  // Connect to the db
  MongoClient.connect("mongodb://localhost:27017/myrestaurent", function(err, db) {
    if(err) { return console.dir(err); 
    } else {
      console.log("connect to db");
      var xx = text.split(":");
      var yy = xx[1].split(",");
      var collection = db.collection('restaurents');
      var colTempRest = db.collection('tempRest');
      
      console.log('collection: %j', collection.find());
      collection.find().forEach(function(doc) {
  colTempRest.update( {res_id: doc._id, fb_id: sender}, 
        {res_id: doc._id,
         fb_id: sender,
   restaurantName: doc.restaurantName,
   restaurantType: doc.restaurantType,
   lat: doc.lat,
   long: doc.long,
         distance: getDistanceInKm(yy[0], yy[1], doc.lat, doc.long)
        }, {upsert: true})
      });


      colTempRest.find({fb_id: sender}).sort({distance:1}).limit(3).toArray(function(err, docs){
        console.log( "retrieved records:");
        console.log('docs: %j', docs);
        if(docs.length > 0) {
          callback(null, docs)
        } else {
          callback("no restaurant found")
        }
      });
    }
    });
}

function _getArticles(callback) {
  rssReader(properties.google_news_endpoint, function(err, articles) {
    if (err) {
      callback(err)
    } else {
      if (articles.length > 0) {
        callback(null, articles)
      } else {
        callback("no articles received")
      }
    }
  })
}

exports.getArticles = function(callback) {
  _getArticles(callback)
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: properties.facebook_message_endpoint,
    qs: { access_token: properties.facebook_token },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.log(response.statusCode)
      console.error("Unable to send message.");
      //console.error(response);
      console.error(error);
    }
  });  
}

function _sendRestaurantMessage(sender, restaurant) {
  messageData = {
    recipient: {
      id: sender
    },
    message: {
    attachment:{
          type:"template",
          payload:{
            template_type:"generic",
            elements:[
              {
                title:restaurant.restaurantName,
                subtitle: restaurant.restaurantType + ' ' +restaurant.distance
                }
        ]
        }
        }
      }
  }
  
  callSendAPI(messageData)
}

function _sendArticleMessage(sender, article) {
  messageData = {
    recipient: {
      id: sender
    },
    message: {
    attachment:{
          type:"template",
          payload:{
            template_type:"generic",
            elements:[
              {
                title:article.title,
                subtitle: article.published.toString(),
                item_url:article.link
                }
        ]
        }
        }
      }
  }
  
  callSendAPI(messageData)
}

function callWitAI(query, callback) {
  query = encodeURIComponent(query);
   request({
    uri: properties.wit_endpoint+query,
    qs: { access_token: properties.wit_token },
    method: 'GET'
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully got %s", response.body);
      try {
        body = JSON.parse(response.body)
        intent = body["entities"]["intent"][0]["value"]
        callback(null, intent)
      } catch (e) {
        callback(e)
      }
    } else {
      console.log(response.statusCode)
      console.error("Unable to send message. %s", error);
      callback(error)
    }
  });
}

exports.sendArticleMessage = function(sender, article) {
  _sendArticleMessage(sender, article)
}

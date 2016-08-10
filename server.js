var express = require('express');
var app=express();
var port=process.env.PORT||8080;
var fs=require("fs");
var bodyParser = require('body-parser');
var url=require("url");
var querystring=require("querystring");
var session=require("express-session");
var http=require('http');
var https=require('https');
var imageType=require('image-type');

const key=require("./key.json");        //key information such as twitter OAuth key and database url and cookie secret

//---------------------------------mongodb setup------------------------------------
var mongo=require("mongodb");
var monk=require("monk");
var dburl=key.dburl;  //dburl will be the second argument
const db=monk(dburl);
const collectionName="ezpin"

//----------------------passport authentication setup------------------------
var passport=require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
app.use(session({
  secret: key.sessionSecret,
  resave: true,
  saveUninitialized: false
}));
app.use(passport.initialize())
app.use(passport.session())

passport.use('twitter',new TwitterStrategy(key.twitterKey,function(token, tokenSecret, profile, done){
  process.nextTick(function(){
    db.collection(collectionName).find({id:profile.id},function(err,data){
      if(err){
        done(err,null);
        throw err;
      }
      if(data.length!=0){   //if user exist, synchronize user profile and then continue with that profile.
        data[0].username=profile.username;
        data[0].iconURL=profile["_json"].profile_image_url;
        db.collection(collectionName).update({id:profile.id},data[0]);
        done(null,data[0]);
      }
      else{     //else create a new account
        var newProf={};
        newProf.id=profile.id;
        newProf.username=profile.username;
        newProf.iconURL=profile["_json"].profile_image_url;
        newProf.pin=[];
        
        db.collection(collectionName).insert(newProf,function(err){
          if(err){
            done(err,null);
            throw err;
          }
          
          done(null,newProf);
        });
      }
    });
    
  });
  
}));

passport.serializeUser(function (user, done) {
	done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    db.collection(collectionName).find({id:id},function(err,user){
      if(err){
        done(err,null);
        throw err;
      }
      done(null,user[0]);
    });
});

//------------------------------end of setting up passport authentication-----------------------


//---------------------------------------user functions-----------------------------------------
function ifImgValid(url,succ,fail){          //check if a url is a valid image. If yes, call succ, else call fail
    if(url.substring(0,7)=="http://"){
        http.get(url, function (res) {
            res.once('data', function (chunk) {
                res.destroy();
                if(imageType(chunk))succ();
                else fail();
            });
        }).on('error',function(){
          fail();
        })
    }
    else if(url.substring(0,8)=="https://"){
        https.get(url, function (res) {
            res.once('data', function (chunk) {
                res.destroy();
                if(imageType(chunk))succ();
                else fail();
            });
        }).on('error',function(){
          fail();
        })
    }
    else fail();
}

function isValid(str) { return /^\w+$/.test(str); };      //the function that checks if a string is purely composed of number and alphabets

//-------------------------------routing--------------------------------------------------------
app.set("views",__dirname+"/client");
app.set("view engine","jade");

app.use(express.static(__dirname+'/client'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/',function(req,res){
  //we will build the list of all pins
  db.collection(collectionName).find({},function(err,data){
    if(err) throw err;
    var list=[];
    for(var i=0;i<data.length;i++){
      for(var j=0;j<data[i].pin.length;j++){
        list.push({
          id: data[i].id,
          username: data[i].username,
          iconURL: data[i].iconURL,
          title: data[i].pin[j].title,
          url: data[i].pin[j].url
        });
      }
    }
    
    res.render("index",{
      user: req.user,
      pins: list
    });
  });
});

app.get('/signin',passport.authenticate('twitter'));

app.get('/signin/callback',passport.authenticate('twitter', {
  successRedirect : '/',
  failureRedirect : '/signin'
}));

app.get('/signout',function(req,res){
  req.logout();
  res.redirect('/');
})

app.get('/newpin',function(req,res){
  if(!req.user){
    res.redirect('/signin');
    return;
  }
  res.render("newpin",{
    user: req.user,
    err: querystring.parse(url.parse(req.url).query).err
  });
});


app.post('/newpin',function(req,res){
  if(!req.user){
    res.redirect('/signin');
    return;
  }
  var title=req.body.title;
  var url=req.body.url;
  
  ifImgValid(url,
    function(){
      db.collection(collectionName).find({id:req.user.id},function(err,data){
        if(err) throw err;
        
        if(data.length==0){       //impossible! if u have an user profile in cookie then u probably already have a profile in db
          res.redirect('/signin');
          return;
        }
        
        var profile=data[0];
        profile.pin.push({
          title: title,
          url: url
        });
        
        db.collection(collectionName).update({id:profile.id},profile);
        res.redirect('/');
        return;
      });
    },
    function(){
      res.redirect('/newpin?err=invalid');
      return;
    });
});

app.get('/pin',function(req,res){
  var id=querystring.parse(url.parse(req.url).query).id;
  db.collection(collectionName).find({id:id},function(err,data){
    if(err)throw err;
    
    if(data.length==0){   //if the user does not exist which should not happen at all!
      res.redirect('/');
      return;
    }
    
    var profile=data[0];
    var list=[];
    for(var i=0;i<profile.pin.length;i++){      //for the sake of reusing the index.jade code as pin.jade
      list.push({
        id: profile.id,
        username: profile.username,
        iconURL: profile.iconURL,
        title: profile.pin[i].title,
        url: profile.pin[i].url,
        i: i
      });
    }
    
    res.render("pin",{
      id: id,
      user: req.user,
      pins: list
    });
  });
  
  if(req.user&&req.user.id==id){
  }
})

app.get('/delete',function(req,res){
  var id=querystring.parse(url.parse(req.url).query).id;
  var i=querystring.parse(url.parse(req.url).query).i;
  if(!(req.user&&req.user.id&&req.user.id==id)){
    res.redirect('/signin');
    return;
  }
  db.collection(collectionName).find({id:id},function(err,data){
    if(err){
      throw err;
    }
    if(data.length==0){     //should not happen
      res.redirect('/');
      return;
    }
    
    var profile=data[0];
    profile.pin.splice(i,1);
    db.collection(collectionName).update({id:id},profile);
    res.redirect('/pin?id='+id);
    return;
  });
});

app.listen(port,function(){
  console.log("the app is listening on port "+port);
});


var express = require('express');
var app=express();
var port=process.env.PORT||8080;
var fs=require("fs");
var bodyParser = require('body-parser');
var url=require("url");
var querystring=require("querystring");
var session=require("client-sessions");

var mongo=require("mongodb");
var monk=require("monk");
var dburl=process.argv[3];  //dburl will be the second argument

const db=monk(dburl);
const loginCollectionName="ezbar-login"

function isValid(str) { return /^\w+$/.test(str); };      //the function that checks if a string is purely composed of number and alphabets

app.set("views",__dirname+"/client");
app.set("view engine","jade");

app.use(express.static(__dirname+'/client'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  cookieName: "session",
  secret: process.argv[2],            //session secret will be the first argument
  duration: 60*60*1000,               //one hour in length
  activeDuration: 60*60*1000
}));

app.use(function(req,res,next){
  req.db=db;
  next();
})

app.get('/',function(req,res){
  res.render("index",{
    user: req.session.user
  });
});

app.get('/signup',function(req,res){
  res.render("signup",
  {
      err: querystring.parse(url.parse(req.url).query).err,
      user: req.session.user
  });
});

app.post('/signup',function(req,res){
  console.log(req.body);
  var loginCollection=req.db.collection(loginCollectionName);
  
  //if the signup input is invalid 
  if(!req.body.username||!req.body.password||!req.body["re-password"]){
    res.redirect("/signup?err=empty");
    return;
  }
  if(req.body.password!=req.body["re-password"]){
    res.redirect("/signup?err=notMatch");
    return;
  }
  if(!isValid(req.body.username)||!isValid(req.body.password)||!isValid(req.body["re-password"])){
    res.redirect("/signup?err=invalid");
    return;
  }
  
  loginCollection.count({"username": req.body.username},function(err,count){
    if(err){
      throw err;
    }
    if(count!=0){
      res.redirect("/signup?err=exist");
      return;
    }
    
    
    loginCollection.insert({
      username: req.body.username,
      password: req.body.password             
    });
    
    req.session.user={
      username: req.body.username
    }
    console.log("yes!");
    res.redirect('/');
    return;
  })
  
  
});

app.get('/signin',function(req,res){
  res.render("signin",
  {
      err: querystring.parse(url.parse(req.url).query).err,
      user: req.session.user
  });
});

app.post('/signin',function(req,res){
  console.log(req.body);
  var loginCollection=req.db.collection(loginCollectionName);
  
  if(!req.body.username||!req.body.password){
    res.redirect("/signin?err=invalid");
    return;
  }
  
  loginCollection.find({username: req.body.username, password: req.body.password},function(err,data){
    if(err){
      throw err;
    }
    
    if(data.length==0){          //if anything is wrong, login failed
      res.redirect("/signin?err=invalid");
      return;
    }
    
    req.session.user={          //else, login to session and go to the main page
      username: req.body.username
    }
    
    res.redirect('/');
    return;
  });
  
});

app.get('/signout',function(req,res){
  req.session.reset();
  res.redirect('/');
  return;
});

app.listen(port,function(){
  console.log("the app is listening on port "+port);
});


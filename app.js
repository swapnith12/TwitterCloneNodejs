const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 6;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, password, name, gender)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
       '${name}',
       '${gender}'  
      );`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const dbQuery = `SELECT user.username AS username,tweet.tweet AS tweet,tweet.date_time AS dateTime
    FROM
    user inner join follower on user.user_id=follower.following_user_id
    inner join tweet on follower.following_user_id=tweet.user_id
    ORDER BY
    dateTime DESC
    LIMIT
    4`;
  const dbArray = await database.all(dbQuery);
  response.send(dbArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const dbQuery = `
    SELECT
    user.username
    FROM
    user inner join follower on user.user_id=follower.following_user_id
    ORDER BY
    following_user_id`;
  const dbArray = await database.all(dbQuery);
  response.send(dbArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const dbQuery = `
    SELECT
    user.username
    FROM
    user inner join follower on user.user_id=follower.follower_user_id
    ORDER BY 
    follower_user_id`;
  const dbArray = await database.all(dbQuery);
  response.send(dbArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const dbQuery = `SELECT tweet.tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply_id) AS replies,tweet.date_time AS dateTime
    FROM
    user inner join follower on user.user_id=follower.following_user_id
    inner join tweet on follower.following_user_id=tweet.user_id
     inner join like on tweet.tweet_id=like.tweet_id
     inner join reply on tweet.tweet_id=reply.tweet_id
    WHERE 
    tweet.tweet_id='${tweetId}'
    ORDER BY
    dateTime DESC`;
  const dbArray = await database.get(dbQuery);
  if (dbArray !== []) {
    response.send(dbArray);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const dbQuery = `SELECT user.username as likes
    FROM
    user inner join follower on user.user_id=follower.following_user_id
    inner join tweet on follower.following_user_id=tweet.user_id
     inner join like on tweet.tweet_id=like.tweet_id
    WHERE 
    tweet.tweet_id='${tweetId}'
    AND likes IN (
      SELECT
      username as likes
      from
      user inner join like on user.user_id = like.user_id
  )
    GROUP BY
    username`;
    const dbArray = await database.get(dbQuery);
    if (dbArray !== undefined) {
      response.send(dbArray);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;

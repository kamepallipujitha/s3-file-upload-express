require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fileUpload = require('express-fileupload');
const AWS = require('aws-sdk');
const path = require('path');
const session = require('express-session');
const app = express();
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'secretkey',
  resave: false,
  saveUninitialized: true
}));

app.listen(5001, () => {
  console.log("Server running on http://localhost:5001");
});

mongoose.connect('mongodb://127.0.0.1:27017/mnstproject');
const projectSchema = new mongoose.Schema({
  name: String,
  password: String,
  email: String
}, { versionKey: false });
const projectModel = mongoose.model('project', projectSchema, 'project');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

app.get('/home', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});


app.post('/register', async (req, res) => {
  const { name, password, email } = req.body;
  let user = await projectModel.findOne({ name });

  if (!user) {
    const hashedPassword = await bcrypt.hash(password, 10);
    user = new projectModel({ name, password: hashedPassword, email });
    await user.save();
  }

  req.session.user = name;
  res.redirect('/dashboard');
});

async function validateUser(name, password) {
  const user = await projectModel.findOne({ name });
  if (!user) return null;

  const isMatch = await bcrypt.compare(password, user.password);
  return isMatch ? user : null;
}


app.post('/login', async (req, res) => {
  const { name, password } = req.body;

  const user = await validateUser(name, password);

  if (user) {
    req.session.user = name;
    res.redirect('/files');
  } else {
    res.send('Invalid credentials');
  }
});


app.get('/dashboard', async (req, res) => {
  if (!req.session.user) return res.redirect('/home');

  const userFolder = req.session.user + '/';
  const s3Params = {
    Bucket: BUCKET_NAME,
    Prefix: userFolder,
  };

  try {
    const data = await s3.listObjectsV2(s3Params).promise();
    const files = data.Contents.map(item => ({
      key: item.Key,
      name: item.Key.replace(userFolder, ''),
      url: s3.getSignedUrl('getObject', {
        Bucket: BUCKET_NAME,
        Key: item.Key,
        Expires: 60 * 5, 
      }),
    }));

    res.render('dashboard', {
      username: req.session.user,
      files: files,
      uploaded: false
    });
  } catch (err) {
    console.error('AWS S3 list error:', err);
    res.send('Could not fetch files');
  }
});

app.post('/upload', async (req, res) => {
  if (!req.session.user) return res.status(401).send('Unauthorized');
  const file = req.files.file;
  const params = {
    Bucket: BUCKET_NAME,
    Key: `${req.session.user}/${file.name}`,
    Body: file.data
  };
  try {
    await s3.upload(params).promise();
    res.sendStatus(200); 
  } catch (err) {
    console.error(err);
    res.status(500).send('Upload failed');
  }
});

app.get('/files', async (req, res) => {
  if (!req.session.user) return res.redirect('/home');

  const userFolder = req.session.user + '/';
  const s3Params = {
    Bucket: BUCKET_NAME,
    Prefix: userFolder,
  };

  try {
    const data = await s3.listObjectsV2(s3Params).promise();
    const files = data.Contents.map(item => ({
      name: item.Key.replace(userFolder, ''),
      url: s3.getSignedUrl('getObject', {
        Bucket: BUCKET_NAME,
        Key: item.Key,
        Expires: 60 * 5, 
      }),
    }));

    res.render('files', { username: req.session.user, files });
  } catch (err) {
    console.error('AWS S3 list error:', err);
    res.status(500).send('Could not fetch files');
  }
});
app.delete('/delete/:filename', async (req, res) => {
  const filename = req.params.filename;
  const username = req.session.user; //

  if (!username) {
    console.error("Username is undefined in session");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const s3Key = `${username}/${filename}`;
  console.log("Trying to delete:", s3Key);

  try {
    await s3.deleteObject({
      Bucket: BUCKET_NAME, 
      Key: s3Key
    }).promise();

    res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/home'); 
  });
});

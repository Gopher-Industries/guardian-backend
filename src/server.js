require('dotenv').config();
const express = require('express');
const mongoose = require('./config/db');  
const path = require('path');
const app = express();

// Set up EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


const userRoutes = require('./routes/user');
const wifiCSIRoutes = require('./routes/wifiCSI');
const activityRecognitionRoutes = require('./routes/activityRecognition');
const alertsRoutes = require('./routes/alerts');
const roleRoutes = require('./routes/role');
const adminRoutes = require('./routes/admin'); 
const checkUserRoleRoutes = require('./routes/checkUserRole'); 



app.use('/api/users', userRoutes);
app.use('/api/wifi-csi', wifiCSIRoutes);
app.use('/api/activity-recognition', activityRecognitionRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api', roleRoutes);
app.use('/api/admin', adminRoutes); 
app.use('/api', checkUserRoleRoutes); 


// Test route
app.get('/api', (req, res) => {
  res.json({ message: 'API works' });
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

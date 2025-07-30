require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Starting server...');
console.log('PORT from env:', process.env.PORT);
console.log('Using PORT:', PORT);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2Inchgl0ngpp_';

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    console.error('Bad JSON:', error.message);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Add detailed request logging middleware
app.use((req, res, next) => {
  console.log(`\n=== REQUEST ===`);
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log(`Headers:`, req.headers);
  console.log(`Query:`, req.query);
  console.log(`Body:`, req.body);
  console.log(`================\n`);
  next();
});

// Add response validation middleware
app.use((req, res, next) => {
  const originalJson = res.json;
  const originalSend = res.send;
  
  res.json = function(data) {
    console.log(`✅ Sending JSON response for ${req.method} ${req.url}:`, JSON.stringify(data).substring(0, 200));
    return originalJson.call(this, data);
  };
  
  res.send = function(data) {
    console.log(`📤 Sending response for ${req.method} ${req.url}:`, typeof data, data.toString().substring(0, 100));
    return originalSend.call(this, data);
  };
  
  next();
});

// Add environment logging
console.log('Environment check:');
console.log('__dirname:', __dirname);
console.log('process.cwd():', process.cwd());
console.log('NODE_ENV:', process.env.NODE_ENV);

// Data file path
const DATA_FILE = path.join(__dirname, 'data', 'submissions.json');
console.log('DATA_FILE path:', DATA_FILE);

// Ensure data directory and file exist
try {
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    console.log('Creating data directory...');
    fs.mkdirSync(path.join(__dirname, 'data'));
  }
  if (!fs.existsSync(DATA_FILE)) {
    console.log('Creating submissions.json file...');
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
  }
  console.log('✅ Data directory and file ready');
} catch (error) {
  console.error('❌ Error creating data directory/file:', error);
  // Don't exit on Render - it might not have write permissions
}

// Load submissions with error handling
let submissions = [];
try {
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  submissions = JSON.parse(data);
} catch (error) {
  console.error('Error loading submissions:', error);
  submissions = [];
}

// Main list and leaderboard stored in memory for demo
let approvedList = [
  {
    id: nanoid(),
    name: 'Insane Challenge',
    creator: 'Player123',
    levelId: 'IC-001',
    points: 100,
  },
  {
    id: nanoid(),
    name: 'Impossible Trial',
    creator: 'DarkMode',
    levelId: 'IT-002',
    points: 80,
  },
];

let leaderboard = {}; // { ign: points }

// Save submissions helper with error handling
function saveSubmissions() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(submissions, null, 2));
    console.log('✅ Submissions saved successfully');
  } catch (error) {
    console.error('❌ Error saving submissions:', error);
    console.log('📝 Note: Render might not allow file writes. Consider using a database.');
    // Don't throw error on Render - just log it
    if (process.env.NODE_ENV !== 'production') {
      throw error;
    }
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Routes with improved error handling

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
});

// Get main list
app.get('/api/list', (req, res) => {
  try {
    res.json(approvedList);
  } catch (error) {
    console.error('Error getting list:', error);
    res.status(500).json({ error: 'Failed to get list' });
  }
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get all submissions (admin)
app.get('/api/submissions', (req, res) => {
  try {
    res.json(submissions);
  } catch (error) {
    console.error('Error getting submissions:', error);
    res.status(500).json({ error: 'Failed to get submissions' });
  }
});

// Submit record or level
app.post('/api/submit', (req, res) => {
  try {
    const { type } = req.body;
    if (type === 'record') {
      const { ign, footage } = req.body;
      if (!ign || !footage) return res.status(400).json({ error: 'IGN and footage required' });
      const newSubmission = {
        id: nanoid(),
        type,
        ign,
        footage,
        status: 'pending',
      };
      submissions.push(newSubmission);
      saveSubmissions();
      return res.json({ message: 'Record submitted for review' });
    } else if (type === 'level') {
      const { name, creator, verifier, footage, levelId } = req.body;
      if (!name || !creator || !verifier || !footage || !levelId) {
        return res.status(400).json({ error: 'All fields including levelId are required' });
      }
      const newSubmission = {
        id: nanoid(),
        type,
        name,
        creator,
        verifier,
        footage,
        levelId,
        status: 'pending',
        points: 0,
      };
      submissions.push(newSubmission);
      saveSubmissions();
      return res.json({ message: 'Level submitted for review' });
    }
    return res.status(400).json({ error: 'Invalid submission type' });
  } catch (error) {
    console.error('Error submitting:', error);
    res.status(500).json({ error: 'Failed to submit' });
  }
});

// Approve submission (admin)
app.post('/api/approve/:id', (req, res) => {
  try {
    const { id } = req.params;
    const submission = submissions.find((s) => s.id === id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    submission.status = 'approved';
    submission.points = req.body.points || 0;

    if (submission.type === 'level') {
      approvedList.push(submission);
    }

    saveSubmissions();
    res.json({ message: 'Submission approved' });
  } catch (error) {
    console.error('Error approving submission:', error);
    res.status(500).json({ error: 'Failed to approve submission' });
  }
});

// Reject submission (admin)
app.post('/api/reject/:id', (req, res) => {
  try {
    const { id } = req.params;
    const submission = submissions.find((s) => s.id === id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    submission.status = 'rejected';
    saveSubmissions();
    res.json({ message: 'Submission rejected' });
  } catch (error) {
    console.error('Error rejecting submission:', error);
    res.status(500).json({ error: 'Failed to reject submission' });
  }
});

// Add level manually (admin)
app.post('/api/add-level', (req, res) => {
  try {
    const { name, creator, levelId, points } = req.body;
    if (!name || !creator || !levelId) return res.status(400).json({ error: 'Name, creator, and levelId required' });

    const newLevel = {
      id: nanoid(),
      name,
      creator,
      levelId,
      points: points || 0,
    };
    approvedList.push(newLevel);
    res.json({ message: 'Level added to the list' });
  } catch (error) {
    console.error('Error adding level:', error);
    res.status(500).json({ error: 'Failed to add level' });
  }
});

// Add points to leaderboard (admin)
app.post('/api/add-leaderboard', (req, res) => {
  try {
    const { ign, points } = req.body;
    if (!ign || typeof points !== 'number' || points <= 0) {
      return res.status(400).json({ error: 'Valid IGN and positive points required' });
    }
    if (!leaderboard[ign]) leaderboard[ign] = 0;
    leaderboard[ign] += points;
    res.json({ message: `Added ${points} points to ${ign}` });
  } catch (error) {
    console.error('Error adding to leaderboard:', error);
    res.status(500).json({ error: 'Failed to add to leaderboard' });
  }
});

// Serve admin page (e.g., /2Inchl0ngpp_)
app.get('/2Inchl0ngpp_', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '2Inchl0ngpp_.html'));
});

// Debug route - shows what routes are being hit
app.use('*', (req, res, next) => {
  console.log(`❌ No route matched for: ${req.method} ${req.originalUrl}`);
  console.log(`Available API routes: /api/test, /api/list, /api/leaderboard, /api/submissions`);
  next();
});

// Fallback for other pages (optional)
app.get('*', (req, res) => {
  console.log(`Serving fallback HTML for: ${req.url}`);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

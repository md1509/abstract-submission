const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// Initialize SQLite database
const db = new sqlite3.Database('./submissions.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    return;
  }
  console.log('Connected to SQLite database.');

  // Create submissions table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitterName TEXT,
      submitterEmail TEXT,
      abstractTitle TEXT,
      abstractType TEXT,
      theme TEXT,
      company TEXT,
      discipline TEXT,
      abstractContent TEXT,
      authorNames TEXT,
      authorEmails TEXT,
      authorPositions TEXT,
      authorContact TEXT,
      submittedAt TEXT,
      deadline TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Submissions table ready.');
    }
  });
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Serve the form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper function to validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper function to validate multiple emails
function validateMultipleEmails(emails) {
  const emailArray = emails.split(',').map(email => email.trim());
  return emailArray.every(isValidEmail);
}

// Helper function to count words
function countWords(text) {
  return text.trim().split(/\s+/).length;
}

// Handle form submission
app.post('/submit', (req, res) => {
  const {
    submitterName,
    submitterEmail,
    abstractTitle,
    abstractType,
    theme,
    company,
    discipline,
    abstractContent,
    authorNames,
    authorEmails,
    authorPositions,
    authorContact,
  } = req.body;

  // Validate fields
  if (
    !submitterName ||
    !submitterEmail ||
    !abstractTitle ||
    !abstractType ||
    !theme ||
    !company ||
    !discipline ||
    !abstractContent ||
    !authorNames ||
    !authorEmails ||
    !authorPositions ||
    !authorContact
  ) {
    return res.status(400).send('Error: All fields are required.');
  }

  // Validate submitter email
  if (!isValidEmail(submitterEmail)) {
    return res.status(400).send('Error: Invalid submitter email address.');
  }

  // Validate author emails
  if (!validateMultipleEmails(authorEmails)) {
    return res.status(400).send('Error: One or more author email addresses are invalid.');
  }

  // Validate abstract word count
  const wordCount = countWords(abstractContent);
  if (wordCount > 350) {
    return res
      .status(400)
      .send(`Error: Abstract exceeds the 350-word limit. Current word count: ${wordCount}.`);
  }

  // Set deadline
  const deadline = "2024-12-15T23:59:59"; // Example deadline

  // Insert data into the database
  const submittedAt = new Date().toISOString();
  db.run(`
    INSERT INTO submissions (
      submitterName, submitterEmail, abstractTitle, abstractType, theme,
      company, discipline, abstractContent, authorNames, authorEmails,
      authorPositions, authorContact, submittedAt, deadline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    submitterName, submitterEmail, abstractTitle, abstractType, theme,
    company, discipline, abstractContent, authorNames, authorEmails,
    authorPositions, authorContact, submittedAt, deadline
  ], function (err) {
    if (err) {
      console.error('Error saving submission to database:', err.message);
      return res.status(500).send('Error: Could not save your submission.');
    }

    const submissionId = this.lastID; // Auto-increment ID

    console.log(`Submission saved to database with ID: ${submissionId}`);

    const modifyUrl = `http://localhost:3000/modify/${submissionId}`;

    // Send email notifications
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: 'mohammedhatem1509@gmail.com',
        pass: 'bslo trjk prpf zomn',
      },
    });

    // Email to the submitter
    const submitterMailOptions = {
      from: 'mohammedhatem1509@gmail.com',
      to: submitterEmail,
      subject: `Abstract Submission Confirmation: ${abstractTitle}`,
      text: `Dear ${submitterName},

We received your abstract submission to the 19th QatarEnergy LNG Engineering Conference.

Authors: ${authorNames}
Title: ${abstractTitle}
Type: ${abstractType}
Theme: ${theme}
Company: ${company}
Discipline: ${discipline}
Submission ID: ${submissionId}

You can modify your submission until the deadline: ${new Date(deadline).toLocaleString()}.

Modify your submission here: ${modifyUrl}

Best regards,
Abstract Submission Team`
    };

    transporter.sendMail(submitterMailOptions, (emailErr) => {
      if (emailErr) {
        console.error('Error sending email to submitter:', emailErr);
      } else {
        console.log('Confirmation email sent to submitter.');
      }
    });

    // Email to the admin
    const adminMailOptions = {
      from: 'mohammedhatem1509@gmail.com',
      to: 'mohammedhatem1509@gmail.com',
      subject: 'New Abstract Submission Received',
      text: `A new abstract has been submitted.

Submission ID: ${submissionId}
Submitter Name: ${submitterName}
Submitter Email: ${submitterEmail}

Abstract Title: ${abstractTitle}
Abstract Type: ${abstractType}
Theme: ${theme}
Company: ${company}
Discipline: ${discipline}

Author/Co-author Details:
- Names: ${authorNames}
- Emails: ${authorEmails}
- Positions: ${authorPositions}
- Contact Numbers: ${authorContact}

Abstract Content:
${abstractContent}

Submitted At: ${submittedAt}`
    };

    transporter.sendMail(adminMailOptions, (emailErr) => {
      if (emailErr) {
        console.error('Error sending email to admin:', emailErr);
      } else {
        console.log('Notification email sent to admin.');
      }
    });

    // Respond to the user
    res.send(`Thank you for your submission. Use the following link to modify your submission if needed: <a href="${modifyUrl}">${modifyUrl}</a>`);
  });
});

// Serve the modification form
app.get('/modify/:id', (req, res) => {
  const submissionId = req.params.id;

  db.get('SELECT * FROM submissions WHERE id = ?', [submissionId], (err, row) => {
    if (err) {
      console.error('Error retrieving submission:', err.message);
      return res.status(500).send('Error: Could not retrieve the submission.');
    }

    if (!row) {
      return res.status(404).send('Error: Submission not found.');
    }

    const currentTime = new Date().toISOString();
    if (currentTime > row.deadline) {
      return res.status(403).send('Error: Deadline for modification has passed.');
    }

    // Render a simple pre-filled form for modification
    res.send(`
      <form action="/update/${submissionId}" method="POST">
        <label for="abstractTitle">Abstract Title:</label>
        <input type="text" name="abstractTitle" value="${row.abstractTitle}" required />
        <!-- Add other fields pre-filled similarly -->
        <button type="submit">Submit Changes</button>
      </form>
    `);
  });
});

// Handle submission updates
app.post('/update/:id', (req, res) => {
  const submissionId = req.params.id;
  const { abstractTitle } = req.body; // Include other fields here

  db.run(`
    UPDATE submissions
    SET abstractTitle = ?
    WHERE id = ?
  `, [abstractTitle, submissionId], (err) => {
    if (err) {
      console.error('Error updating submission:', err.message);
      return res.status(500).send('Error: Could not update the submission.');
    }

    res.send('Your submission has been updated successfully.');
  });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

const sendOTPEmail = async (to, otp) => {
  const mailOptions = {
    from: process.env.MAIL_USER,
    to,
    subject: 'UniVITA Login OTP',
    text: `Your OTP is: ${otp}\nValid for 5 minutes.`
  };
  await transporter.sendMail(mailOptions);
};

const sendVisitorEmail = async (to, firstName, lastName, date, time, reason, status, primaryBleId, additionalVisitors) => {
  let subject, text;
  if (status === 'APPROVED') {
    subject = 'Visit Request Approved - HCT Academy';
    text = `Dear ${firstName} ${lastName},\n\nYour visit request has been APPROVED.\n\nDetails:\nDate: ${date}\nTime: ${time}\nReason: ${reason}\n${primaryBleId ? `Your BLE Tag: ${primaryBleId}\n` : ''}\nWe look forward to seeing you.`;
  } else {
    subject = 'Visit Request Received - HCT Academy';
    text = `Dear ${firstName} ${lastName},\n\nYour visit request has been received. We will review and notify you.\n\nDetails:\nDate: ${date}\nTime: ${time}\nReason: ${reason}`;
  }
  await transporter.sendMail({ from: process.env.MAIL_USER, to, subject, text });
};

module.exports = { sendOTPEmail, sendVisitorEmail };
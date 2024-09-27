const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');

const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY,
});

const sender = new Sender("MS_gEP33a@trial-pxkjn4107x0gz781.mlsender.net", "Guardian Monitor");

// Function to send an email
const sendEmail = (to, subject, text, html) => {
    const recipient = [new Recipient(to, to)];
    const emailParams = new EmailParams()
        .setFrom(sender)
        .setTo(recipient)
        .setSubject(subject);

    if (html) {
        emailParams.setHtml(html);
    }

    if (text) {
        emailParams.setText(text);
    }

    mailerSend.email
        .send(emailParams)
        .then((response) => console.log(response))
        .catch((error) => console.log(error));
};

// Function to send a password reset email
const sendPasswordResetEmail = async (to, name, token) => {
    const recipient = [new Recipient(to, to)];
    const subject = 'Password Reset';
    const emailParams = new EmailParams()
    .setFrom(sender)
    .setTo(recipient)
    .setSubject(subject);
    
    // Construct reset URL
    const resetLink = `${process.env.BASE_URL}/api/v1/auth/reset-password?token=${token}`;

    const html = `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Password Reset</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        max-width: 600px;
                        margin: 20px auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        padding: 20px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                    }
                    .header {
                        background-color: #007bff;
                        color: #ffffff;
                        padding: 20px;
                        text-align: center;
                        border-radius: 8px 8px 0 0;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .content {
                        padding: 20px;
                        text-align: center;
                    }
                    .content h2 {
                        font-size: 20px;
                        color: #333333;
                    }
                    .btn {
                        display: inline-block;
                        background-color: transparent; /* No background */
                        color: #007bff; /* Text color matches original background color */
                        padding: 10px 20px;
                        text-decoration: none;
                        border: 2px solid #007bff; /* Outline border */
                        border-radius: 5px;
                        margin: 20px 0;
                        transition: background-color 0.3s ease, color 0.3s ease; /* Smooth transition for hover */
                    }

                    .btn:hover {
                        background-color: #007bff; /* Background on hover */
                        color: #ffffff; /* Text color changes to white on hover */
                    }
                    .footer {
                        text-align: center;
                        padding: 20px;
                        font-size: 12px;
                        color: #888888;
                    }
                    .footer a {
                        color: #007bff;
                        text-decoration: none;
                    }
                </style>
            </head>
            <body>

                <div class="container">
                    <div class="header">
                        <h1>Password Reset</h1>
                    </div>
                    
                    <div class="content">
                        <h2>Hello ${name}!</h2>
                        <p>You recently requested to reset your password. Click the button below to reset it:</p>
                        <a href="${resetLink}" class="btn"><span>Reset Password</span></a>
                        <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
                    </div>
                    
                    <div class="footer">
                        <p>If you have any questions, feel free to contact our support team at <a href="mailto:support@guardian-monitor.com">support@guardian-monitor.com</a>.</p>
                        <p>Thank you for using our service!</p>
                    </div>
                </div>

            </body>
        </html>
    `;

    emailParams.setHtml(html);
    emailParams.setText(`Your Password Reset link is: ${resetLink}`);

    await mailerSend.email
        .send(emailParams)
        .then((response) => console.log(response))
        .catch((error) => console.error(error));
}

// Function to send pin code verification email
const sendPinCodeVerificationEmail = async (to, name, pinCode) => {
    const recipient = [new Recipient(to, to)];
    const subject = 'PIN Code Verification';
    const emailParams = new EmailParams()
        .setFrom(sender)
        .setTo(recipient)
        .setSubject(subject);

    const html = `

            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PIN Code Verification</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        max-width: 600px;
                        margin: 20px auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        padding: 20px;
                        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                    }
                    .header {
                        background-color: #007bff;
                        color: #ffffff;
                        padding: 20px;
                        text-align: center;
                        border-radius: 8px 8px 0 0;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .content {
                        padding: 20px;
                        text-align: center;
                    }
                    .content h2 {
                        font-size: 20px;
                        color: #333333;
                    }
                    .pin-code {
                        font-size: 32px;
                        letter-spacing: 5px;
                        background-color: #f8f9fa;
                        padding: 10px 20px;
                        border-radius: 5px;
                        display: inline-block;
                        color: #007bff;
                        margin: 20px 0;
                    }
                    .footer {
                        text-align: center;
                        padding: 20px;
                        font-size: 12px;
                        color: #888888;
                    }
                    .btn {
                        display: inline-block;
                        background-color: #007bff;
                        color: #ffffff;
                        padding: 10px 20px;
                        text-decoration: none;
                        border-radius: 5px;
                    }
                </style>
            </head>
            <body>

            <div class="container">
                <div class="header">
                    <h1>Verify Your Account</h1>
                </div>
                
                <div class="content">
                    <h2>Hello ${name}!</h2>
                    <p>We received a request to verify your account. Please use the following PIN code to complete the verification process:</p>
                    <div class="pin-code">${pinCode}</div>
                    <p>If you did not request this, please ignore this email or contact support if you have concerns.</p>
                    <p>Once you've entered the PIN code, your account will be verified, and you'll have full access to your account.</p>
                </div>
                
                <div class="footer">
                    <p>If you have any questions, feel free to contact our support team at support@guardian-monitor.com.</p>
                    <p>Thank you for choosing our service!</p>
                </div>
            </div>

            </body>
            </html>
            `;

    emailParams.setHtml(html);
    emailParams.setText(`Your PIN code for verification is: ${pinCode}`);

    await mailerSend.email
        .send(emailParams)
        .then((response) => console.log(response))
        .catch((error) => console.error(error));
}

module.exports = { sendEmail, sendPasswordResetEmail, sendPinCodeVerificationEmail };
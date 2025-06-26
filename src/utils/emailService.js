// Email service to handle Brevo API integration for sending notifications

// Brevo API key - in production, use environment variable
const BREVO_API_KEY = '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';

/**
 * Send email notification using Brevo API
 * @param {object} notification - Email notification object from Supabase
 * @returns {Promise<object>} - Response from Brevo API
 */
export const sendEmailNotification = async (notification) => {
  try {
    // Prepare email data for Brevo API
    const emailData = {
      sender: {
        name: "SRMIST Examination Control Team",
        email: "examcontrol@srmist.edu.in",
      },
      to: [{
        email: notification.recipient_email,
        name: notification.recipient_name,
      }],
      subject: notification.subject,
      htmlContent: formatEmailHtml(notification),
    };

    // Add attachments if present
    if (notification.attachments && notification.attachments.length > 0) {
      emailData.attachment = notification.attachments.map(attachment => {
        // For URLs, we need to convert them to base64 first
        return {
          url: attachment,
          name: getFileNameFromUrl(attachment)
        };
      });
    }
    
    // Send email using Brevo API
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify(emailData),
    });
    
    // Check if the request was successful
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Brevo API error: ${JSON.stringify(errorData)}`);
    }
    
    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error('Error sending email notification:', error);
    throw error;
  }
};

/**
 * Extract filename from URL
 * @param {string} url - URL to extract filename from
 * @returns {string} - Filename
 */
const getFileNameFromUrl = (url) => {
  try {
    // Get the file name from the URL
    const urlParts = url.split('/');
    let fileName = urlParts[urlParts.length - 1];
    
    // Remove query parameters if any
    if (fileName.includes('?')) {
      fileName = fileName.split('?')[0];
    }
    
    return fileName || 'attachment';
  } catch (error) {
    return 'attachment';
  }
};

/**
 * Format email content as HTML
 * @param {object} notification - Email notification object
 * @returns {string} - Formatted HTML content
 */
const formatEmailHtml = (notification) => {
  const contentParagraphs = notification.content.split('\n\n').map(p => `<p>${p}</p>`).join('');
  
  // Email template with SRM branding
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #003b71;
          padding: 20px;
          text-align: center;
        }
        .header h1 {
          color: white;
          margin: 0;
        }
        .content {
          padding: 20px;
          background-color: #f9f9f9;
        }
        .footer {
          background-color: #f1f1f1;
          padding: 15px;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
        .button {
          display: inline-block;
          background-color: #003b71;
          color: white;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 4px;
          margin-top: 15px;
        }
        .request-id {
          background-color: #f0f0f0;
          border: 1px solid #ddd;
          padding: 8px 12px;
          border-radius: 4px;
          font-family: monospace;
          margin: 10px 0;
          display: inline-block;
        }
        .attachments {
          margin-top: 20px;
          border-top: 1px solid #ddd;
          padding-top: 15px;
        }
        .attachment-item {
          margin-bottom: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>SRM Examination Control Portal</h1>
        </div>
        <div class="content">
          <h2>${notification.subject}</h2>
          ${notification.request_id ? 
            `<div>Request ID: <span class="request-id">${notification.request_id}</span></div>` : ''}
          ${contentParagraphs}
          ${notification.attachments && notification.attachments.length > 0 ? 
            `<div class="attachments">
              <p><strong>Attachments:</strong></p>
              <ul>
                ${notification.attachments.map(url => 
                  `<li class="attachment-item">
                    <a href="${url}" target="_blank">View Attachment (${getFileNameFromUrl(url)})</a>
                  </li>`
                ).join('')}
              </ul>
            </div>` : ''}
        </div>
        <div class="footer">
          <p>This is an automated message from the SRM Examination Control Portal. Please do not reply to this email.</p>
          <p>© ${new Date().getFullYear()} SRMIST. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Process pending email notifications from the database
 * @param {object} supabase - Supabase client
 */
export const processEmailQueue = async (supabase) => {
  try {
    // Get pending notifications
    const { data: notifications, error } = await supabase
      .from('email_notifications')
      .select('*')
      .eq('status', 'pending')
      .order('sent_at', { ascending: true })
      .limit(10);
      
    if (error) {
      throw error;
    }
    
    console.log(`Processing ${notifications?.length || 0} pending email notifications`);
    
    // Process each notification
    for (const notification of notifications) {
      try {
        console.log(`Sending notification: ${notification.id}`);
        // Send email notification
        await sendEmailNotification(notification);
        
        // Update notification status to sent
        await supabase
          .from('email_notifications')
          .update({ status: 'sent' })
          .eq('id', notification.id);
          
        console.log(`Successfully sent notification: ${notification.id}`);
      } catch (err) {
        console.error(`Failed to send notification ${notification.id}:`, err);
        
        // Update notification status to failed
        await supabase
          .from('email_notifications')
          .update({ 
            status: 'failed',
            content: notification.content + '\n\nError: ' + err.message 
          })
          .eq('id', notification.id);
      }
    }
  } catch (error) {
    console.error('Error processing email queue:', error);
  }
};

/**
 * Create and trigger an email notification
 * @param {object} supabase - Supabase client
 * @param {object} data - Notification data
 */
export const createEmailNotification = async (supabase, data) => {
  try {
    console.log('Creating email notification with data:', data);
    
    const { error } = await supabase
      .from('email_notifications')
      .insert({
        recipient_email: data.recipientEmail,
        recipient_name: data.recipientName,
        request_id: data.requestId,
        email_type: data.emailType,
        subject: data.subject,
        content: data.content,
        attachments: data.attachments || [],
        status: 'pending'
      });
      
    if (error) {
      throw error;
    }
    
    // Process email queue immediately
    await processEmailQueue(supabase);
    
    return { success: true };
  } catch (error) {
    console.error('Error creating email notification:', error);
    throw error;
  }
}; 
// SMS delivery stub — wire up your SMS provider here (Twilio, Africa's Talking, etc.)
// In development, OTPs are printed to the console.

export async function sendSms(phone: string, message: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    // TODO: replace with real SMS provider
    // Example Twilio:
    //   const client = twilio(env.TWILIO_SID, env.TWILIO_TOKEN);
    //   await client.messages.create({ body: message, from: env.TWILIO_FROM, to: phone });
    throw new Error('SMS provider not configured. Set up a real provider in sms.service.ts');
  }

  // Dev / test: log OTP to console so it can be used without a real SMS provider
  console.log(`\n[SMS] ── To: ${phone}\n[SMS]    ${message}\n`);
}

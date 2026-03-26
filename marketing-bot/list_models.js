require('dotenv').config({ path: '/Users/tomasfernandez/strawberry/marketing-bot/.env' });
const googleApiKey = process.env.GOOGLE_API_KEY;

async function list() {
    console.log("Listing models...");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${googleApiKey}`);
    const data = await res.json();
    console.log(JSON.stringify(data.models?.map(m => m.name), null, 2));
}
list();

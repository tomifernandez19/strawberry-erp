require('dotenv').config({ path: '/Users/tomasfernandez/strawberry/marketing-bot/.env' });
const googleApiKey = process.env.GOOGLE_API_KEY;

async function test() {
    console.log("Testing Imagen 4.0...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instances: [
                    {
                        prompt: "A luxury leather shoe on a marble podium",
                    }
                ],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "1:1"
                }
            })
        });
        const data = await response.json();
        console.log("STATUS:", response.status);
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();

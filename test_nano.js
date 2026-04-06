const googleApiKey = "AIzaSyBd7ceGCgi-S3cmeByj2dvuIPYyNeEpCSs";

async function testNano() {
    console.log("Testing Nano Banana 2 (Gemini 3.1 Flash Image)...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${googleApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "Generate a luxury shoe on a marble podium" }] }]
            })
        });
        const data = await response.json();
        console.log("STATUS:", response.status);
        if (data.error) {
            console.log("ERROR MESSAGE:", data.error.message);
        } else {
            console.log("SUCCESS! Model found.");
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}
testNano();

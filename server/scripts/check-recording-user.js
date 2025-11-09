import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb+srv://miriam3161912_db_user:nVMM8BlDE5Z3u0JL@cluster0.k8tj7ih.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkUser() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('rides');
    const user = await db.collection('users').findOne({
      phone: '089203012'
    });
    
    console.log('\n=== User Data ===');
    console.log(JSON.stringify(user, null, 2));
    
    if (user && user.name_recording_url) {
      console.log('\n=== Recording URL Details ===');
      console.log('Original URL:', user.name_recording_url);
      console.log('Has .mp3:', user.name_recording_url.includes('.mp3'));
      console.log('Ends with .mp3:', user.name_recording_url.endsWith('.mp3'));
      
      // Test the logic from playFullName
      let playbackUrl = user.name_recording_url;
      if (!playbackUrl.endsWith('.mp3') && !playbackUrl.includes('.mp3?')) {
        playbackUrl = playbackUrl + '.mp3';
      }
      console.log('Playback URL (after fix):', playbackUrl);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

checkUser();

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Configuração do Cliente R2
const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const DB_FILE = 'calls_db.json'; // Arquivo único que guarda todas as chamadas

// Helper: Ler o banco de dados
async function getDB() {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: DB_FILE });
    const response = await S3.send(command);
    const str = await response.Body.transformToString();
    return JSON.parse(str);
  } catch (error) {
    return []; // Retorna vazio se o arquivo não existir ainda
  }
}

// Helper: Salvar no banco de dados
async function saveDB(data) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: DB_FILE,
    Body: JSON.stringify(data),
    ContentType: "application/json"
  });
  await S3.send(command);
}

// Helper: Gerar Link Fresco
function generateLink(call, host, protocol) {
  let expiryTime = null;
  const mins = parseInt(call.mins);
  if (mins > 0) {
    expiryTime = Date.now() + (mins * 60 * 1000);
  }

  const payload = {
    n: call.name,
    v: call.video,
    a: call.avatar,
    e: expiryTime
  };

  // Base64 seguro para URL
  const base64Param = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${protocol}://${host}/?d=${base64Param}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // POST: Salvar/Criar Chamada
    if (req.method === 'POST') {
      const { id, name, video, avatar, mins } = req.body;
      if (!name || !video) return res.status(400).json({ error: 'Dados incompletos' });

      let db = await getDB();
      const newCall = { id: id || Date.now().toString(), name, video, avatar, mins: mins || 0 };
      
      const existingIndex = db.findIndex(c => c.id === newCall.id);
      if (existingIndex > -1) {
        db[existingIndex] = newCall;
      } else {
        db.unshift(newCall);
      }

      await saveDB(db);
      return res.status(200).json({ success: true, data: newCall });
    }

    // DELETE: Apagar Chamada
    if (req.method === 'DELETE') {
      const { id } = req.query;
      let db = await getDB();
      db = db.filter(c => c.id !== id);
      await saveDB(db);
      return res.status(200).json({ success: true });
    }

    // GET: Listar ou Pegar Link
    if (req.method === 'GET') {
      const { id } = req.query;
      const db = await getDB();

      if (id) {
        const call = db.find(c => c.id === id);
        if (!call) return res.status(404).json({ error: 'Chamada não encontrada' });

        const link = generateLink(call, req.headers.host, req.headers['x-forwarded-proto'] || 'https');
        
        return res.status(200).json({
          id: call.id,
          name: call.name,
          url: link,
          validity: call.mins > 0 ? `${call.mins} minutos` : 'Infinita'
        });
      }

      return res.status(200).json(db);
    }

  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({ error: 'Erro interno no banco de dados' });
  }
}

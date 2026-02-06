const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

// Configuração do Cliente R2 (Reutilizando suas variáveis)
const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const DB_FILE = 'calls_db.json'; // Arquivo onde salvaremos as configurações

// Helper: Ler o banco de dados do R2
async function getDB() {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: DB_FILE });
    const response = await S3.send(command);
    const str = await response.Body.transformToString();
    return JSON.parse(str);
  } catch (error) {
    // Se o arquivo não existir (primeira vez), retorna array vazio
    return [];
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

// Helper: Gerar Link (Lógica do Backend)
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
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // --- POST: Salvar/Criar Chamada (Usado pelo Painel) ---
    if (req.method === 'POST') {
      const { id, name, video, avatar, mins } = req.body;
      if (!name || !video) return res.status(400).json({ error: 'Dados incompletos' });

      let db = await getDB();
      const newCall = { id: id || Date.now().toString(), name, video, avatar, mins: mins || 0 };
      
      const existingIndex = db.findIndex(c => c.id === newCall.id);
      if (existingIndex > -1) {
        db[existingIndex] = newCall; // Atualizar
      } else {
        db.unshift(newCall); // Criar novo
      }

      await saveDB(db);
      return res.status(200).json({ success: true, data: newCall });
    }

    // --- DELETE: Apagar Chamada (Usado pelo Painel) ---
    if (req.method === 'DELETE') {
      const { id } = req.query;
      let db = await getDB();
      db = db.filter(c => c.id !== id);
      await saveDB(db);
      return res.status(200).json({ success: true });
    }

    // --- GET: Listar ou Pegar Link Específico (Usado pelo Bot e Painel) ---
    if (req.method === 'GET') {
      const { id } = req.query;
      const db = await getDB();

      // Se passar ID, gera um link NOVO e ÚNICO para aquela chamada
      if (id) {
        const call = db.find(c => c.id === id);
        if (!call) return res.status(404).json({ error: 'Chamada não encontrada' });

        const link = generateLink(call, req.headers.host, req.headers['x-forwarded-proto'] || 'https');
        
        return res.status(200).json({
          id: call.id,
          name: call.name,
          url: link, // O link gerado agora com validade fresca
          validity: call.mins > 0 ? `${call.mins} minutos` : 'Infinita'
        });
      }

      // Se não passar ID, lista todas (para o Painel)
      return res.status(200).json(db);
    }

  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({ error: 'Erro interno no banco de dados' });
  }
}

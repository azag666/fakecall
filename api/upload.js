import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Configura o cliente do Cloudflare R2
// Certifique-se que as variáveis de ambiente (R2_ACCOUNT_ID, etc) estão configuradas na Vercel
const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  // 1. Configuração de CORS (Essencial para o navegador aceitar a resposta)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Responde rápido para pre-flight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Apenas aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { filename, filetype } = req.body;
    
    if (!filename || !filetype) {
      return res.status(400).json({ error: 'Nome do ficheiro e tipo são obrigatórios' });
    }

    // Limpa o nome do ficheiro e adiciona timestamp para evitar duplicatas
    const cleanFileName = filename.replace(/\s+/g, '-').replace(/[^\w\.-]/g, '');
    const uniqueName = `${Date.now()}-${cleanFileName}`;

    // Prepara o comando de upload para o R2
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: uniqueName,
      ContentType: filetype,
    });

    // Gera a URL assinada (válida por 600 segundos = 10 minutos para uploads lentos)
    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 600 });
    
    // Monta a URL pública final para onde o vídeo vai estar acessível
    // Remove qualquer barra final da variável de ambiente para evitar barras duplas
    const publicUrlBase = process.env.R2_PUBLIC_URL ? process.env.R2_PUBLIC_URL.replace(/\/$/, "") : "";
    const finalPublicUrl = `${publicUrlBase}/${uniqueName}`;

    return res.status(200).json({ uploadUrl, publicUrl: finalPublicUrl });
  } catch (error) {
    console.error("Erro no backend de upload:", error);
    return res.status(500).json({ error: 'Erro interno ao gerar link', details: error.message });
  }
}

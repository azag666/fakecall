// Este arquivo roda no servidor da Vercel (Node.js)
// Rota: /api/gerar

export default function handler(req, res) {
  // Configuração de CORS para permitir requisições de qualquer lugar
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Responder imediatamente para requisições OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Pega os parâmetros da URL (GET) ou do corpo (POST)
    // Exemplo GET: /api/gerar?nome=Cliente&tempo=10&video=https://...
    const { nome, video, tempo } = req.method === 'POST' ? req.body : req.query;

    // Validação básica
    const userName = nome || "Usuário";
    const userVideo = video || "https://videos.pexels.com/video-files/4350035/4350035-sd_506_960_30fps.mp4";
    const userTime = tempo ? parseInt(tempo) : 10; // tempo em minutos para expirar

    // Lógica de Expiração (Timestamp atual + minutos * 60 * 1000)
    // Se tempo for 0, nunca expira (opcional)
    const expiryTime = new Date().getTime() + (userTime * 60 * 1000);

    // Cria o objeto JSON
    const data = {
      n: userName,
      v: userVideo,
      e: expiryTime
    };

    // Converte para JSON String e depois para Base64
    const jsonString = JSON.stringify(data);
    const base64Param = Buffer.from(jsonString).toString('base64');

    // Monta a URL final
    // req.headers.host pega o domínio atual automaticamente (ex: meushow.vercel.app)
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const finalUrl = `${protocol}://${host}/?d=${base64Param}`;

    // Retorna para o Bot
    return res.status(200).json({
      success: true,
      url: finalUrl,
      details: {
        nome: userName,
        expira_em: new Date(expiryTime).toLocaleString('pt-BR')
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

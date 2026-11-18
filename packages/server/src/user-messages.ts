import { MAX_CHAT_LENGTH } from "@cardgame/protocol";

const portugueseMessages = new Map<string, string>([
  ["Request body is too large.", "O corpo da solicitação é muito grande."],
  ["Malformed JSON.", "JSON inválido."],
  [
    "Could not read request body.",
    "Não foi possível ler o corpo da solicitação.",
  ],
  ["Request aborted.", "Solicitação cancelada."],
  ["Invalid request body.", "O corpo da solicitação é inválido."],
  [
    "Too many sign-in requests. Try again later.",
    "Muitas tentativas de entrar. Tente novamente mais tarde.",
  ],
  [
    "A code was just sent. Wait a moment before asking for another.",
    "Um código acabou de ser enviado. Aguarde um momento antes de pedir outro.",
  ],
  [
    "We could not send the email. Try again.",
    "Não foi possível enviar o e-mail. Tente novamente.",
  ],
  [
    "That code has expired. Ask for a new one.",
    "Esse código expirou. Solicite um novo.",
  ],
  [
    "Too many wrong tries. Ask for a new code.",
    "Você digitou o código errado muitas vezes. Solicite um novo.",
  ],
  ["That code is not right.", "Esse código está incorreto."],
  ["Not signed in.", "Você ainda precisa entrar."],
  ["Sign in to host a table.", "Entre para criar uma mesa."],
  ["Choose a game first.", "Escolha um jogo primeiro."],
  ["That song is no longer playing.", "Essa música já parou de tocar."],
  [
    "Preview is not in the song catalog.",
    "A prévia não está no catálogo de músicas.",
  ],
  [
    "No preview found for this song.",
    "Nenhuma prévia encontrada para essa música.",
  ],
  ["Could not load the preview.", "Não foi possível carregar a prévia."],
  ["Not found.", "Recurso não encontrado."],
  ["Method not allowed.", "Método não permitido."],
  ["Something went wrong.", "Algo deu errado."],
  ["This table does not exist any more.", "Essa mesa não existe mais."],
  ["Invalid message.", "Mensagem inválida."],
  ["You are not in this room.", "Você não está nesta mesa."],
  ["Choose a name first.", "Escolha um nome primeiro."],
  ["Say something first.", "Escreva uma mensagem primeiro."],
  [
    `Messages can be at most ${MAX_CHAT_LENGTH} characters.`,
    `As mensagens podem ter até ${MAX_CHAT_LENGTH} caracteres.`,
  ],
  [
    "You are sending messages too fast. Wait a moment.",
    "Você está enviando mensagens muito rápido. Aguarde um momento.",
  ],
  ["Please enter a name.", "Digite um nome."],
  ["That seat does not exist.", "Esse lugar não existe."],
  [
    "You cannot change seats during a game.",
    "Você não pode trocar de lugar durante a partida.",
  ],
  ["That seat is taken.", "Esse lugar está ocupado."],
  [
    "You cannot leave your seat during a game.",
    "Você não pode sair do seu lugar durante a partida.",
  ],
  [
    "Only the host can remove a player.",
    "Só quem criou a mesa pode remover jogadores.",
  ],
  ["That player is not here.", "Essa pessoa não está na mesa."],
  ["The host cannot be removed.", "Quem criou a mesa não pode ser removido."],
  [
    "Only the host can end the game.",
    "Só quem criou a mesa pode encerrar a partida.",
  ],
  [
    "Only the host can start the game.",
    "Só quem criou a mesa pode iniciar a partida.",
  ],
  ["A game is already running.", "Já há uma partida em andamento."],
  ["The game is paused.", "A partida está pausada."],
  ["That move is not valid.", "Essa jogada é inválida."],
  ["You are not playing in this game.", "Você não está jogando nesta partida."],
  [
    "Only the host can skip a player.",
    "Só quem criou a mesa pode pular a vez de alguém.",
  ],
  ["No game is running.", "Nenhuma partida em andamento."],
  ["That player is not in the game.", "Essa pessoa não está na partida."],
  ["That player is still connected.", "Essa pessoa ainda está conectada."],
  [
    "There is nothing to skip for that player right now.",
    "Essa pessoa não tem nenhuma jogada para pular agora.",
  ],
  ["The game is over.", "A partida acabou."],
  ["The game is getting ready.", "A partida está sendo preparada."],
  [
    "The previous turn is still being revealed.",
    "O resultado da rodada anterior ainda está sendo revelado.",
  ],
  ["It is not your turn.", "Ainda não é a sua vez."],
  [
    "You have already placed this song.",
    "Você já colocou esta música na linha do tempo.",
  ],
  [
    "That is not a spot in your timeline.",
    "Essa posição não faz parte da sua linha do tempo.",
  ],
  ["You are not in this game.", "Você não está nesta partida."],
  [
    "You cannot bet on your own turn.",
    "Você não pode apostar na sua própria vez.",
  ],
  ["You have already bet this turn.", "Você já apostou nesta rodada."],
  [
    "You have already passed on betting this turn.",
    "Você já passou a aposta nesta rodada.",
  ],
  ["You have no tokens to bet.", "Você não tem fichas para apostar."],
  [
    "That is not a gap in the current player's timeline.",
    "Essa posição não faz parte da linha do tempo de quem está jogando.",
  ],
  ["Unknown move.", "Jogada desconhecida."],
]);

/** Existing room and game rules report refusals as English strings. */
export function messagePtBR(message: string): string | undefined {
  const limits = /^(.+) (needs at least|allows at most) (\d+) players\.$/.exec(
    message,
  );
  if (!limits) return portugueseMessages.get(message);
  const [, game, rule, players] = limits;
  return rule === "needs at least"
    ? `${game} precisa de pelo menos ${players} jogadores.`
    : `${game} permite no máximo ${players} jogadores.`;
}

export function httpError(error: string): {
  error: string;
  errorPtBR?: string;
} {
  return { error, errorPtBR: messagePtBR(error) };
}

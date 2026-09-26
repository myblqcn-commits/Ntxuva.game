export interface RuleStep {
  title: string;
  badge: string;
  summary: string;
  details: string;
  icon: string;
  illustrationType: 'intro' | 'board' | 'sow' | 'resow' | 'capture' | 'win';
  tips?: string;
}

export const RULES_STEPS: RuleStep[] = [
  {
    title: 'O Que é o Ntxuva?',
    badge: 'Origem & Tradição',
    summary:
      'O Ntxuva (também conhecido como Tsobwa) é uma obra-prima milenar da estratégia abstrata em Moçambique.',
    details:
      'Considerado o "xadrez moçambicano", é jogado tradicionalmente em tabuleiros esculpidos em madeira maciça ou escavados no solo, utilizando pequenas sementes arredondadas (conhecidas como tinsongo) ou conchas. O objetivo é exercitar o cálculo numérico, a previsão espacial e a paciência táctica.',
    icon: 'military_tech',
    illustrationType: 'intro',
    tips: 'Jogadores experientes calculam até 3 voltas à frente antes de tocar na primeira semente.',
  },
  {
    title: 'Anatomia do Tabuleiro',
    badge: '4 x 8 Cavas',
    summary:
      'O tabuleiro é composto por 4 fileiras de cavas. Cada jogador domina o seu próprio território com 2 fileiras.',
    details:
      'No formato clássico (4x8), existem 32 cavas no total com 2 sementes em cada (64 sementes ao todo). O Jogador 2 comanda as duas fileiras superiores e o Jogador 1 comanda as duas inferiores. Cada lado possui uma Fileira Interior (junto ao centro) e uma Fileira Exterior (na borda).',
    icon: 'grid_view',
    illustrationType: 'board',
    tips: 'Você só semeia sementes no seu próprio lado. Nunca coloca sementes nas cavas do adversário.',
  },
  {
    title: 'Movimento Básico & Direção',
    badge: 'Semeadura Contínua',
    summary:
      'Escolha uma cava sua com 2 ou mais sementes. Recolha todas e distribua 1 semente por cava no sentido do circuito.',
    details:
      'As sementes circulam em um circuito fechado de duas fileiras: avançando pela fileira exterior e retornando pela interior (ou vice-versa). Cavas com apenas 1 semente estão dormentes: não podem ser jogadas inicialmente a menos que não haja nenhuma outra opção com 2 ou mais sementes.',
    icon: 'sync',
    illustrationType: 'sow',
    tips: 'Cavas isoladas com 1 semente servem de armadilha defensiva para absorver sementes que chegam.',
  },
  {
    title: 'Semeadura Múltipla (Relançamento)',
    badge: 'Reação em Cadeia',
    summary:
      'Se a sua última semente cair numa cava que já continha sementes, o lance não para!',
    details:
      'Você recolhe imediatamente todas as sementes acumuladas dessa mesma cava e continua a semear sem interrupção na mesma direção. Um único lance bem calculado pode gerar 3 a 5 voltas consecutivas pelo tabuleiro, alterando drasticamente o equilíbrio da partida.',
    icon: 'replay',
    illustrationType: 'resow',
    tips: 'A semeadura só termina quando a última semente cai numa cava vazia (ficando com 1 semente) ou quando é efetuada uma captura.',
  },
  {
    title: 'A Captura Dupla Tradicional',
    badge: 'Golpe Estratégico',
    summary:
      'O ataque fulminante ocorre quando a sua última semente cai na sua Fileira Interior e a cava adversária em frente tem sementes!',
    details:
      'Você captura imediatamente todas as sementes da cava interior adversária. E, como bónus estratégico consagrado nas regras moçambicanas, se a cava exterior diretamente atrás dela também possuir sementes, você leva também essas sementes! As sementes capturadas saem do tabuleiro para a sua pontuação.',
    icon: 'bolt',
    illustrationType: 'capture',
    tips: 'Nunca deixe a sua fileira interior com muitas sementes diretamente em frente a cavas carregadas do rival.',
  },
  {
    title: 'Vitória & Fim de Jogo',
    badge: 'Cheque-Mate do Ntxuva',
    summary:
      'A partida termina quando um jogador fica sem movimentos possíveis ou tem todo o seu território deserto.',
    details:
      'Existem dois motivos principais de vitória: 1) Imobilização Total: o rival fica apenas com cavas de 0 ou 1 semente e não tem movimentos legais para semear. 2) Limpeza do Território: todas as sementes do lado adversário foram capturadas.',
    icon: 'trophy',
    illustrationType: 'win',
    tips: 'Mesmo com poucas sementes, imobilizar a última jogada do rival garante a vitória imediata!',
  },
];

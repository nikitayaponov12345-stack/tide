/**
 * Слой площадки. Игра обращается к Яндексу, CrazyGames, Playgama и Poki только через этот интерфейс.
 * На этапе 0 есть одна заглушка (stub.ts); адаптеры площадок добавятся на вехе «Площадки и деньги».
 */
export interface Platform {
  readonly name: string;
  init(): Promise<void>;
  /** Ресурсы загружены, игра готова к первому действию игрока. */
  loadingFinished(): void;
  /** Игрок играет (после первого нажатия и после каждого возврата из окна). */
  gameplayStart(): void;
  /** Игра на паузе: окно, реклама, свёрнутая вкладка. */
  gameplayStop(): void;
  /** Межстраничная реклама; решение, показывать ли её, принимает игра заранее. */
  showInterstitial(): Promise<void>;
  /** Реклама за вознаграждение: true — досмотрена, награду выдавать. */
  showRewarded(): Promise<boolean>;
  save(key: string, data: string): Promise<void>;
  load(key: string): Promise<string | null>;
  /** Код языка: 'ru', 'en'. */
  language(): string;
}

export interface PlatformCall {
  t: number;
  name: string;
}

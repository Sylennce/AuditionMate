export interface Scene {
  id: string;
  title: string;
  createdAt: string;
}

export interface Line {
  id: string;
  sceneId: string;
  orderIndex: number;
  speakerRole: 'MYSELF' | 'READER';
  text: string;
  cueWord: string;
  audioPath: string | null;
  durationMs: number;
  createdAt: string;
}

export interface TeleprompterSettings {
  fontSize: number;
  margin: number;
  opacity: number;
  mirror: boolean;
  autoScroll: boolean;
}

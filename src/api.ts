import { Scene, Line } from './types';

export const api = {
  async getScenes(): Promise<Scene[]> {
    const res = await fetch('/api/scenes');
    return res.json();
  },

  async createScene(title: string): Promise<Scene> {
    const id = crypto.randomUUID();
    const res = await fetch('/api/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title }),
    });
    return res.json();
  },

  async deleteScene(id: string): Promise<void> {
    await fetch(`/api/scenes/${id}`, { method: 'DELETE' });
  },

  async getLines(sceneId: string): Promise<Line[]> {
    const res = await fetch(`/api/scenes/${sceneId}/lines`);
    return res.json();
  },

  async createLine(formData: FormData): Promise<{ id: string; audioPath: string }> {
    const res = await fetch('/api/lines', {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },

  async updateLine(id: string, data: Partial<Line>): Promise<void> {
    await fetch(`/api/lines/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async deleteLine(id: string): Promise<void> {
    await fetch(`/api/lines/${id}`, { method: 'DELETE' });
  },
};

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IssuesSettingsService } from './settings';

type RefreshCallback = () => Promise<void>;

export class IssuesFileWatcher implements vscode.Disposable {
  private watcher: fs.FSWatcher | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly settings: IssuesSettingsService,
    private readonly onRefresh: RefreshCallback
  ) {}

  async restart(): Promise<void> {
    this.disposeWatcher();

    let storePath: string;
    try {
      storePath = await this.settings.resolveCurrentStorePath();
    } catch {
      return;
    }

    const directory = path.dirname(storePath);
    const fileName = path.basename(storePath);

    try {
      await fs.promises.mkdir(directory, { recursive: true });
    } catch {
      return;
    }

    this.watcher = fs.watch(directory, (eventType, changedName) => {
      if (eventType === 'rename' || eventType === 'change') {
        if (!changedName || path.basename(String(changedName)) === fileName) {
          this.scheduleRefresh();
        }
      }
    });
  }

  dispose(): void {
    this.disposeWatcher();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      void this.onRefresh();
    }, 150);
  }

  private disposeWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}

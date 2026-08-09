import {App, Modal, normalizePath, Notice} from "obsidian";
import StudyTimeStatisticsPlugin from "../../../main";
import {createRoot, Root} from "react-dom/client";
import { DashboardRoot } from "../../components/DashboardRoot";
import * as React from "react";
import I18n from "../../../language/i18n";

export class DashboardModal extends Modal {
	private readonly plugin: StudyTimeStatisticsPlugin;
    private root: Root | null = null;
	constructor(plugin: StudyTimeStatisticsPlugin, app: App) {
        super(app);
		this.plugin = plugin;
	}

	onOpen() {
        const {contentEl, modalEl} = this;
        contentEl.empty();
        
		modalEl.addClass('study-time-statistics-dashboard-modal');
        
        if (!this.root) {
            this.root = createRoot(contentEl);
        }
        const onSelect = (filePath: string) => {
            this.openFileInWorkspace(filePath);
            this.close();
        };
        this.root.render(React.createElement(DashboardRoot, { plugin: this.plugin, onSelect }));
	}

	onClose() {
		const {contentEl} = this;
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        contentEl.empty();
	}

    private openFileInWorkspace(filePath: string) {
        const file = this.app.vault.getFileByPath(normalizePath(filePath));
		if(!file) {
			new Notice(I18n.t("fileNotFound"));
			return;
		}
		this.app.workspace.getLeaf().openFile(file).finally();
	}
}

# ⚡ Light Jira

**A high-performance, minimalist Jira client built for speed, offline focus, and deep productivity.**

Light Jira is a Progress Web App (PWA) designed to replace heavy Jira tabs with a streamlined, three-pane interface. It focuses on your immediate workflow, allowing you to organize tickets into custom groups, keep private notes, and maintain a historical record of everything you view—all while persisting data for offline access.

---

## ✨ Key Features

- **🚀 Performance-First**: No heavy frameworks. Pure, vanilla JavaScript ensures instant loads and transitions.
- **📥 Grouped Workflow**: Move tickets out of your "Inbox" into custom groups like "To Review," "Backlog," or "Personal Tasks."
- **📒 Standalone Notes**: Toggle between Jira and Notes mode. A dedicated note-taking environment for your personal thoughts and drafts.
- **🏷️ Label Intelligence**: Tag tickets with custom labels. Click a label to instantly view all tickets with that tag across all lists.
- **🔍 Filter & JQL Loading**: Load up to 50 tickets at once using Jira filters or raw JQL queries into new, auto-refreshing lists.
- **💾 Offline Persistence**: Ticket data, notes, and even pasted screenshots are cached locally for offline access.
- **⏳ History Tracking**: Every ticket you open is automatically tracked in a dedicated History view.
- **📝 Personal Notes**: Each ticket has a persistent, private notes pane for your own thoughts.
- **🖼️ Screenshot Persistence**: Paste images (Ctrl+V) directly into ticket notes or standalone notes; they are stored as base64 data URLs for offline viewing.
- **⚡ Quick Open (F2)**: Press `F2` from anywhere to instantly search and open a ticket by key, URL, or number.
- **📱 PWA Ready**: Install it as a standalone application on your Desktop or Mobile.

---

## 🗺️ Roadmap

### Phase 1: Core Productivity & Data Portability (In Progress)
- [x] **Tabbed Interface**: Switch between Jira and Standalone Notes modes.
- [x] **Note Taking UI**: Full editor with title, body, and dates.
- [x] **Screenshot Persistence**: `Ctrl+V` to paste and store images in notes.
- [x] **Label Intelligence**: Intelligent label suggestions and global label navigation.
- [x] **Advanced Open Ticket**: Handle full Jira URLs.
- [x] **JQL/Filter Loading**: Create groups from Jira filters (up to 50 items).
- [ ] **External Link Handling**: Separate buttons/logic for opening links inside vs. outside the app.

### Phase 2: Testing & Reliability
- [ ] **Mock Atlassian Server**: For development and testing without hitting real APIs.
- [ ] **Automated Test Suite**: End-to-end and unit tests for core logic.

---

## 🛠️ Getting Started

### 1. Prerequisites
- **Node.js** (required to run the local API proxy).

### 2. Setup
Clone the repository and install dependencies (if any):
```bash
git clone https://github.com/boyukbas/light-jira.git
cd light-jira
```

### 3. Run the Proxy
Jira's API has strict CORS policies. This app uses a lightweight Node.js proxy to communicate with Atlassian's servers.
```bash
node proxy.js
```

### 4. Cloud Deployment (Alternative)
If you host the web UI on **GitHub Pages**, browser security (CORS) will block direct requests to Jira. Use the provided **AWS Lambda** assets to bridge the connection:
1.  **Deploy**: Use the `main.tf` with Terraform to deploy `lambda_handler.js` to AWS.
2.  **Configure**: Copy the generated **Function URL**.
3.  **Settings**: Paste it into the **Cloud Proxy URL** field in the app settings.

### 5. Launch the App
Open `index.html` in your browser. For the best experience, use the "Install" button in your browser's address bar to add it as an app.

### 5. Configuration
Click the **Gear Icon** in the top-right corner to enter your Jira details:
- **Email**: Your Atlassian account email.
- **API Token**: Generated from [Atlassian Security Settings](https://id.atlassian.com/manage-profile/security/api-tokens).
- **Jira URL**: Your company's Jira domain (e.g., `https://company.atlassian.net`).
- **Default Project**: The project prefix used when you enter a ticket number without one (e.g., `PROJ`).

---

## 🏗️ Technical Stack

- **Core**: Vanilla JavaScript / HTML5 / CSS3
- **Storage**: `localStorage` for state management and local cache persistence.
- **Offline**: Service Workers for PWA functionality.
- **Proxy**: Node.js `http` module.

---

## ⚖️ Disclaimer
*Light Jira is an unofficial community project and is not affiliated with, endorsed by, or sponsored by Atlassian in any way. "Jira" is a trademark of Atlassian.*

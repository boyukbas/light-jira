# ⚡ Light Jira

**A high-performance, minimalist Jira client built for speed, offline focus, and deep productivity.**

Light Jira is a Progress Web App (PWA) designed to replace heavy Jira tabs with a streamlined, three-pane interface. It focuses on your immediate workflow, allowing you to organize tickets into custom groups, keep private notes, and maintain a historical record of everything you view—all while persisting data for offline access.

---

## ✨ Key Features

- **🚀 Performance-First**: No heavy frameworks. Pure, vanilla JavaScript ensures instant loads and transitions.
- **📥 Grouped Workflow**: Move tickets out of your "Inbox" into custom groups like "To Review," "Backlog," or "Personal Tasks."
- **💾 Offline Persistence**: Ticket titles, summaries, and statuses are cached locally. Your data is available even without an internet connection.
- **⏳ History Tracking**: Every ticket you open is automatically tracked in a dedicated History view, accessible via the top-bar hourglass icon.
- **📝 Personal Notes**: Each ticket has a persistent, private notes pane for your own thoughts, code snippets, or draft comments that aren't synced to Jira.
- **⚡ Quick Open (F2)**: Press `F2` from anywhere to instantly search and open a ticket by its number.
- **🖼️ Image Proxying**: Automatically handles Jira's authentication for attachments, so screenshots and images render seamlessly within the app.
- **📱 PWA Ready**: Install it as a standalone application on your Desktop or Mobile for a distraction-free experience.

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

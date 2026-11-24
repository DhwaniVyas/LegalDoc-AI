# LegalDoc AI

> An AI-powered Legal Document Research Assistant built with FastAPI and React.

LegalDoc AI enables legal professionals to upload documents and perform semantic AI-powered research using a Retrieval-Augmented Generation (RAG) pipeline backed by Groq (openai/gpt-oss-120b).

---

## Technology Stack

| Layer      | Technology                                                     |
|------------|----------------------------------------------------------------|
| Frontend   | React 18, Vite, Tailwind CSS v3, React Router, Axios, Lucide  |
| Backend    | Python, FastAPI, Uvicorn, SQLAlchemy, SQLite                   |
| Auth       | JWT (HTTP-only cookies), Argon2 password hashing, Google OAuth |
| AI / RAG   | Groq API (`openai/gpt-oss-120b`), Sentence Transformers (`all-MiniLM-L6-v2`), ChromaDB, PyMuPDF |

---

## Folder Structure

```
LegalDoc-AI/
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── layouts/            # Page layout wrappers
│   │   ├── lib/                # API client (Axios)
│   │   ├── pages/              # Route-level page components
│   │   │   └── auth/           # Login & Register pages
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css           # Tailwind + global styles
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
│
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── core/               # Config, security, dependencies
│   │   ├── database/           # SQLAlchemy models & session
│   │   ├── routes/             # API route handlers
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   └── services/           # Business logic layer
│   ├── main.py                 # FastAPI entry point
│   └── requirements.txt
│
├── docs/                       # Project documentation
├── .env.example                # Environment variable template
├── .gitignore
└── README.md
```

---

## Local Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- npm

### 1. Clone the repository

```bash
git clone https://github.com/your-username/LegalDoc-AI.git
cd LegalDoc-AI
```

### 2. Configure environment variables

```bash
cp .env.example backend/.env
# Edit backend/.env and fill in your values
```

Required variables:

| Variable           | Description                                      |
|--------------------|--------------------------------------------------|
| `GROQ_API_KEY`     | Groq API key (free Developer tier: console.groq.com/keys) |
| `GROQ_MODEL`       | Groq model (default: `openai/gpt-oss-120b`)      |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID                           |
| `JWT_SECRET_KEY`   | Long random secret for JWT signing               |
| `DATABASE_URL`     | SQLite path (default: `sqlite:///./legaldoc.db`) |
| `FRONTEND_URL`     | CORS origin (default: `http://localhost:5173`)   |

Generate a JWT secret:
```bash
python -c "import secrets; print(secrets.token_hex(64))"
```

---

## Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at **http://localhost:5173**

---

## Running the Backend

```bash
cd backend

# Create and activate virtual environment
py -3 -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
copy ..\\.env.example .env
# Edit .env with your credentials

# Start the server
uvicorn main:app --reload --port 8000
```

API will be available at **http://localhost:8000**  
Interactive docs: **http://localhost:8000/api/docs**

---

## API Endpoints

| Method | Endpoint               | Description                   |
|--------|------------------------|-------------------------------|
| GET    | `/api/health`          | Health check                  |
| POST   | `/api/auth/register`   | Email/password registration   |
| POST   | `/api/auth/login`      | Email/password login          |
| POST   | `/api/auth/google`     | Google ID token login         |
| POST   | `/api/auth/logout`     | Clear auth cookies            |
| GET    | `/api/auth/me`         | Current authenticated user    |
| GET    | `/api/users/me`        | User profile (protected)      |

---

## Authentication Architecture

- **Email/Password**: Argon2 password hashing via `passlib`. Credentials validated against SQLite.
- **Google OAuth**: Google Identity Services on the frontend sends a Google ID token to `POST /api/auth/google`. The backend verifies it with `google-auth` and creates/links the user account.
- **Sessions**: Both flows issue JWT tokens stored in **HTTP-only cookies** (never `localStorage`). Access token expires in 1 hour, refresh token in 7 days.
- **Protected routes**: FastAPI dependency `get_current_user` reads the cookie and validates the JWT on every protected request.

---

## Features Implemented

- [x] Document upload with duplicate prevention and storage
- [x] PDF text extraction (PyMuPDF) with page-wise chunking
- [x] Vector embeddings with Sentence Transformers (`all-MiniLM-L6-v2`)
- [x] Persistent ChromaDB vector store integration
- [x] Grounded RAG pipeline with Groq (`openai/gpt-oss-120b`)
- [x] Interactive Legal Chatbot with multi-turn conversation history
- [x] Real-time token streaming with Server-Sent Events (SSE)
- [x] Grounded source citations (`[S1]`, `[S2]`) with direct PDF page preview links
- [x] Document management (upload, list, preview, download, delete)
- [x] Email/password and Google OAuth authentication with HTTP-only cookies

---

## License

MIT © 2026 LegalDoc AI

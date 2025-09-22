# PROCEED® Excel-Driven Dashboard System

A robust, enterprise-grade dashboard system where every data point, label, and configuration can be controlled through a structured Excel workbook. Business users can update the entire dashboard by simply editing an Excel file and uploading it.

## 🚀 Features

- **Complete Excel Control**: Every element on the dashboard is editable via Excel
- **Real-time Preview**: See changes instantly before committing
- **Version Control**: Full history with rollback capability
- **Data Validation**: Smart Excel validation with error reporting
- **Template Generation**: Download pre-filled templates with current data
- **Zero Visual Disruption**: Updates happen without changing the dashboard design
- **Enterprise RAG Logic**: Automatic status calculation based on metrics

## 📋 Prerequisites

- Node.js 20+
- npm or yarn
- Modern web browser

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd status_update_last
```

### 2. Install Backend Dependencies
```bash
cd backend
npm install
```

### 3. Set Up Database
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 4. Configure Environment
Edit `backend/.env` file:
```env
NODE_ENV=development
PORT=3001
DATABASE_URL="file:./dev.db"
CORS_ORIGIN="*"
MAX_FILE_SIZE=10485760
```

## 🚀 Running the Application

### Start Backend Server
```bash
cd backend
npm run dev
```
Server will start at http://localhost:3001

### Open Dashboard
Open `multi_project_status_dashboard_enhanced.html` in your browser

## 📊 Excel Workbook Structure

The system uses a structured Excel workbook (`proceed_portfolio.xlsx`) with the following sheets:

### HEADERS Sheet
Controls portfolio information and custom labels:
- Portfolio name
- Current/comparison periods
- Report date
- Section titles
- Table headers

### STATUS Sheet
Project status table:
| Column | Description | Values |
|--------|-------------|---------|
| project | Project name | Text |
| statusColor | RAG status | green, amber, red |
| trend | Trend direction | up, down, flat |
| manager | Project manager | Text |
| nextMilestone | Next milestone | Text |
| order | Display order | Number |

### HIGHLIGHTS Sheet
Positive achievements:
| Column | Description |
|--------|-------------|
| project | Optional project name |
| description | Highlight description |
| order | Display order |

### LOWLIGHTS Sheet
Issues and concerns:
| Column | Description |
|--------|-------------|
| project | Optional project name |
| description | Issue description |
| order | Display order |

### MILESTONES Sheet
Project milestones:
| Column | Description | Values |
|--------|-------------|---------|
| project | Project name | Text |
| milestone | Milestone name | Text |
| owner | Responsible person | Text |
| dueDate | Due date | Text |
| statusBadge | Status | Completed, In Progress, Pending, At Risk, or % |
| workstreamUpdate | Update notes | Text |
| order | Display order | Number |

### METRICS Sheet (Optional)
Automatic RAG calculation:
| Column | Description | Range |
|--------|-------------|-------|
| project | Project name | Text |
| spi | Schedule Performance Index | Number |
| cpi | Cost Performance Index | Number |
| sev1Defects | Critical defects | Number |
| sev2Defects | Major defects | Number |
| issues | Open issues | Number |
| riskScore | Risk level | 0.0-1.0 |
| milestoneCompletion | Completion rate | 0.0-1.0 |

### LOOKUPS Sheet (Optional)
Dropdown values and thresholds for automatic calculations

## 📤 How to Use

### 1. Download Template
Click "📥 Download Template" to get a pre-filled Excel template with current data

### 2. Edit in Excel
- Open the downloaded template
- Edit any cells you need to change
- Data validations help ensure correct values
- Cell comments provide guidance

### 3. Upload Changes
1. Click "📤 Upload Excel"
2. Select your edited Excel file
3. Preview changes in the dashboard
4. Confirm to save changes

### 4. Handle Errors
If validation fails:
- An Excel file with IMPORT-REPORT sheet will download
- Review errors and warnings
- Fix issues in your original file
- Re-upload

## 🔄 API Endpoints

### GET /api/template
Download Excel template with current data

### POST /api/upload
Upload and validate Excel file
- Query param: `?commit=true` to save
- Returns preview or error report

### GET /api/dashboard
Get current dashboard data as JSON

### GET /api/versions
List all saved versions

### POST /api/versions/:id/rollback
Rollback to a specific version

### GET /api/versions/:id/excel
Download original Excel file for a version

## 🏗️ Architecture

```
Frontend (HTML + JS)
    ↓
dashboard-bind.js (DOM Binding)
    ↓
REST API (Express + TypeScript)
    ↓
Services Layer
├── ExcelParser (Validation)
├── Transformer (Domain ↔ ViewModel)
├── TemplateBuilder (Excel Generation)
└── Versioning (History & Rollback)
    ↓
Database (SQLite/Postgres via Prisma)
```

## 🧪 Testing

### Run Tests
```bash
cd backend
npm test
```

### Test Coverage
```bash
npm run test:coverage
```

## 📝 Development

### File Structure
```
status_update_last/
├── backend/
│   ├── src/
│   │   ├── domain/       # Data models & types
│   │   ├── services/     # Business logic
│   │   ├── routes/       # API endpoints
│   │   ├── libs/         # Utilities
│   │   └── index.ts      # Server entry
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   └── package.json
├── multi_project_status_dashboard_enhanced.html
├── dashboard-bind.js      # Frontend binding
└── README.md
```

### Key Technologies
- **Backend**: Node.js, Express, TypeScript
- **Database**: Prisma ORM (SQLite/PostgreSQL)
- **Excel**: ExcelJS
- **Validation**: Zod
- **Logging**: Pino

## 🚨 Troubleshooting

### Server won't start
- Check port 3001 is available
- Ensure database migrations are run
- Check .env configuration

### Excel upload fails
- Ensure file is .xlsx format
- Check file size < 10MB
- Verify sheet names match specification

### Dashboard not updating
- Check browser console for errors
- Verify API server is running
- Check CORS settings if hosted separately

## 🔒 Security Considerations

- File upload limited to 10MB
- Only .xlsx files accepted
- Input validation on all fields
- SQL injection prevention via Prisma
- XSS protection in frontend rendering

## 📄 License

Private - Enterprise Use Only

## 🤝 Support

For issues or questions:
- Check the troubleshooting section
- Review API documentation at http://localhost:3001/api/openapi.json
- Contact the development team

---

**PROCEED®** - Enterprise Project Portfolio Management
import pandas as pd
from sqlalchemy import create_engine
import re
import os

# --- Configuration ---
CSV_FILE = 'Export_Contacts_Active students (not lifetime)_Feb_2026_1_19_PM.csv'
TABLE_NAME = 'active_students'
DB_CONNECTION = os.environ.get("DATABASE_URL")
if not DB_CONNECTION:
    raise RuntimeError("DATABASE_URL environment variable is required")

def clean_col_name(col):
    col = re.sub(r'[^a-zA-Z0-9]', '_', col)
    col = re.sub(r'_+', '_', col)
    col = col.lower().strip('_')
    if col and col[0].isdigit():
        col = 'col_' + col
    return col

print(f"Reading {CSV_FILE}...")
try:
    df = pd.read_csv(CSV_FILE, dtype={'Phone': str, 'Additional Phones': str})
    df.columns = [clean_col_name(c) for c in df.columns]
    
    # Fix Date Columns - NOW WITH UTC=True
    date_cols = [col for col in df.columns if 'date' in col or 'created' in col or 'updated' in col]
    for col in date_cols:
        # utc=True forces everything to UTC, solving the mixed timezone crash
        df[col] = pd.to_datetime(df[col], errors='coerce', utc=True)

    print(f"Uploading {len(df)} rows to table '{TABLE_NAME}'...")
    engine = create_engine(DB_CONNECTION)
    df.to_sql(TABLE_NAME, engine, if_exists='replace', index=False)
    print("✅ Success! Data imported.")
    print("Columns created:", list(df.columns))
except FileNotFoundError:
    print("❌ ERROR: Could not find the CSV file.")
    print("Make sure the file name matches exactly.")
    print("Current Folder:", os.getcwd())
except Exception as e:
    print(f"❌ An error occurred: {e}")

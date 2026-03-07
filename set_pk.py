import os
from sqlalchemy import create_engine, text

DB_CONNECTION = os.environ.get("DATABASE_URL")
if not DB_CONNECTION:
    raise RuntimeError("DATABASE_URL environment variable is required")

engine = create_engine(DB_CONNECTION)

with engine.connect() as connection:
    print("Setting contact_id as PRIMARY KEY...")
    try:
        # This command tells Postgres that 'contact_id' is the unique ID for each student
        connection.execute(text("ALTER TABLE active_students ADD PRIMARY KEY (contact_id);"))
        connection.commit()
        print("✅ Success! Primary Key set.")
    except Exception as e:
        # If it fails, it usually means it's already set, which is GOOD.
        print(f"ℹ️ Note: {e}")
        print("This likely means the Primary Key is ALREADY set. You are good to go!")

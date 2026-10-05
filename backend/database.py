"""SQLite locally; direct remote libSQL for free hosts with ephemeral disks."""
import os, sqlite3

class Row(dict):
    def __getitem__(self,key):
        return list(self.values())[key] if isinstance(key,int) else super().__getitem__(key)

class Cursor:
    def __init__(self,cursor): self.cursor=cursor
    def row(self,values):
        if values is None:return None
        return Row(zip([x[0] for x in self.cursor.description],values))
    def fetchone(self):return self.row(self.cursor.fetchone())
    def fetchall(self):return [self.row(r) for r in self.cursor.fetchall()]
    def __iter__(self):return iter(self.fetchall())

class Connection:
    def __init__(self,connection): self.connection=connection
    def __enter__(self):return self
    def __exit__(self,kind,value,tb):
        try:
            if kind:self.connection.rollback()
            else:self.connection.commit()
        finally:self.connection.close()
    def execute(self,sql,args=()):return Cursor(self.connection.execute(sql,args))
    def executescript(self,sql):
        # Schema consists of plain statements, never user-supplied SQL.
        for statement in sql.split(';'):
            if statement.strip():self.connection.execute(statement)

def connect(local_path):
    url=os.getenv('TURSO_DATABASE_URL')
    if url:
        import libsql
        raw=libsql.connect(database=url,auth_token=os.environ['TURSO_AUTH_TOKEN'])
    else:raw=sqlite3.connect(local_path,timeout=30)
    return Connection(raw)

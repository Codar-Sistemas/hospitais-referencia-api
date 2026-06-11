"""
In-memory SupabaseClient stand-in shared by the upserter tests.

Honors just enough PostgREST filter semantics (eq. / cs.{} / in.()) over an
in-memory store to exercise the qualification upsert engines. Importable
module — not a runnable test.
"""


class FakeSupabaseClient:
    url = "http://fake"
    key = "fake"

    def __init__(self, hospitals=None, specialties=None):
        self.tables = {
            "hospitals": list(hospitals or []),
            "hospital_specialties": list(specialties or []),
        }
        self._next_id = 1000

    # -- PostgREST-ish filtering -------------------------------------
    def _matches(self, row, key, condition):
        value = row.get(key)
        if condition.startswith("eq."):
            return str(value) == condition[3:]
        if condition.startswith("cs.{"):
            needle = condition[4:-1]
            return needle in (value or [])
        if condition.startswith("in.("):
            options = condition[4:-1].split(",")
            return str(value) in options
        raise AssertionError(f"unsupported filter {key}={condition}")

    def select(self, table, **params):
        params.pop("select", None)
        params.pop("order", None)
        params.pop("limit", None)
        rows = self.tables[table]
        return [
            dict(row) for row in rows if all(self._matches(row, k, v) for k, v in params.items())
        ]

    def upsert(self, table, rows, on_conflict):
        for row in rows:
            row = dict(row)
            if table == "hospitals" and "id" not in row:
                self._next_id += 1
                row["id"] = self._next_id
            if table == "hospital_specialties":
                key = (row["hospital_id"], row["vertical"], row["specialty"])
                self.tables[table] = [
                    r
                    for r in self.tables[table]
                    if (r["hospital_id"], r["vertical"], r["specialty"]) != key
                ]
            self.tables[table].append(row)

    def update(self, table, match, values):
        for row in self.tables[table]:
            if all(str(row.get(k)) == str(v) for k, v in match.items()):
                row.update(values)

    def delete(self, table, **params):
        self.tables[table] = [
            row
            for row in self.tables[table]
            if not all(self._matches(row, k, v) for k, v in params.items())
        ]

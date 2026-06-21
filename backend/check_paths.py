import urllib.request, json

d = json.loads(urllib.request.urlopen("http://127.0.0.1:8000/openapi.json").read())
for p in ["/api/v1/leads", "/api/v1/leads/", "/api/v1/users", "/api/v1/users/", "/api/v1/roles", "/api/v1/roles/"]:
    if p in d["paths"]:
        methods = list(d["paths"][p].keys())
        ops = [d["paths"][p][m].get("operationId", "?") for m in methods]
        print(f"{p}: {methods} -> {ops}")

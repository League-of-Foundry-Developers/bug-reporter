"""
You can run this by just doing python3 simpleWebServer.py

It will then listen for any POST requests on port 8000, and work
it's magic from there.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
from json import dumps
import requests
import os

""" The HTTP request handler """
class RequestHandler(BaseHTTPRequestHandler):

  def _send_cors_headers(self):
      """ Sets headers required for CORS """
      self.send_header("Access-Control-Allow-Origin", "*")
      self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
      self.send_header("Access-Control-Allow-Headers", "x-api-key,Content-Type")

  def send_dict_response(self, d):
      """ Sends a dictionary (JSON) back to the client """
      self.wfile.write(bytes(dumps(d), "utf8"))

  def do_OPTIONS(self):
      self.send_response(200)
      self._send_cors_headers()
      self.end_headers()

  def do_POST(self):
      self.send_response(201)
      self._send_cors_headers()
      self.send_header("Content-Type", "application/json")
      self.end_headers()

      dataLength = int(self.headers["Content-Length"])
      data = self.rfile.read(dataLength)
      # Submit to GitHub
      token = os.environ["GITHUB_PAT"]
      r = requests.post("https://api.github.com/repos/ethck/bug-reporter/issues", headers={"Authorization": f"token {token}"}, data=data)
      # Make Response
      response = {}
      response["status"] = "OK"
      response["json"] = r.json()
      self.send_dict_response(response)


print("Starting server")
httpd = HTTPServer(("127.0.0.1", 8000), RequestHandler)
print("Hosting server on port 8000")
httpd.serve_forever()
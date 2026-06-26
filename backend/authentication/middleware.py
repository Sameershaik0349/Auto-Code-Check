import json
import logging

logger = logging.getLogger(__name__)

class DebugLoginMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == '/api/auth/login/' and request.method == 'POST':
            try:
                # Read request body
                body = request.body.decode('utf-8')
                data = json.loads(body)
                
                log_content = (
                    f"--- DEBUG LOGIN PAYLOAD ---\n"
                    f"Email: '{data.get('email')}'\n"
                    f"Password: '{data.get('password')}'\n"
                    f"Keys present: {list(data.keys())}\n"
                    f"----------------------------\n"
                )
                # Print to terminal
                print("\n" + log_content)
                
                import os
                log_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                log_path = os.path.join(log_dir, 'login_debug.log')
                
                # Write to workspace file
                with open(log_path, 'a') as f:
                    f.write(log_content)
            except Exception as e:
                import os
                err_msg = f"\n--- DEBUG LOGIN PAYLOAD ERROR: {e} ---\n"
                print(err_msg)
                log_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                log_path = os.path.join(log_dir, 'login_debug.log')
                with open(log_path, 'a') as f:
                    f.write(err_msg)
                
        response = self.get_response(request)
        return response

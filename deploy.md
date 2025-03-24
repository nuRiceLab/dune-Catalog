# DUNE Catalog Deployment Guide

## Running the Application as a Service

The DUNE Catalog web application is configured to run as a systemd service, which ensures it runs continuously in the background, automatically restarts if it crashes, and starts automatically when the server boots up. The application is accessible at https://dune-tech.rice.edu/dunecatalog.

### Managing the Web Application

#### Starting the Web Application

To start the DUNE Catalog web application:

```bash
sudo systemctl start dune-catalog.service
```

#### Stopping the Web Application

To stop the DUNE Catalog web application:

```bash
sudo systemctl stop dune-catalog.service
```

#### Restarting the Web Application

To restart the DUNE Catalog web application (e.g., after making changes):

```bash
sudo systemctl restart dune-catalog.service
```

#### Checking the Status

To check the current status of the web application:

```bash
sudo systemctl status dune-catalog.service
```

#### Viewing Logs

To view the application logs:

```bash
sudo journalctl -u dune-catalog.service
```

To follow the logs in real-time:

```bash
sudo journalctl -u dune-catalog.service -f
```

### Enabling/Disabling Automatic Startup

#### Enable at Boot

To make the web application start automatically when the server boots (enabled by default):

```bash
sudo systemctl enable dune-catalog.service
```

#### Disable at Boot

To prevent the web application from starting automatically at boot:

```bash
sudo systemctl disable dune-catalog.service
```

## Manual Deployment

If you need to run the application manually instead of as a service, you can use the following commands:

```bash
cd /home/dune-tech-admin/DUNE-Catalog
source ./.venv/bin/activate
python run.py --production
```

However, this method will not keep the application running when you close the terminal. For production environments, using the systemd service is recommended.

## Troubleshooting

If the service fails to start, check the logs for error messages:

```bash
sudo journalctl -u dune-catalog.service -n 50
```

Common issues include:
- Missing environment variables
- Python virtual environment not activated
- Permission problems
- Port conflicts

## Service Configuration

The systemd service configuration is located at `/etc/systemd/system/dune-catalog.service`. If you need to modify how the service runs, edit this file and then reload the daemon and restart the service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart dune-catalog.service
```

## Web Server Configuration

The DUNE Catalog application runs behind an Nginx web server that handles SSL termination and proxies requests to the appropriate ports:

- Frontend (Next.js): Runs on port 3000 locally
- Backend (FastAPI): Runs on port 8000 locally

The Nginx configuration is located at `/etc/nginx/sites-available/dune-tech.conf` and includes the following proxy settings:

```nginx
# DUNE-Catalog frontend
location /dunecatalog {
    proxy_pass http://localhost:3000;
    # ... other proxy settings ...
}

# DUNE-Catalog backend API
location /dunecatalog/api/ {
    proxy_pass http://localhost:8000/;
    # ... other proxy settings ...
}
```

If you need to modify the Nginx configuration, edit the file and then reload Nginx:

```bash
sudo nano /etc/nginx/sites-available/dune-tech.conf
sudo systemctl reload nginx
```

### Port Conflicts

If you encounter port conflicts (e.g., "address already in use"), you can check which process is using a specific port:

```bash
sudo lsof -i :3000  # Check what's using port 3000
sudo netstat -tuln | grep 3000  # Alternative way to check
sudo fuser -n tcp 3000  # Get the process ID
```

To kill a process using a specific port:

```bash
sudo kill -9 <PID>  # Replace <PID> with the process ID
```

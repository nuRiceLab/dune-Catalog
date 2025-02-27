# DUNE Catalog Deployment Guide

This guide explains how to deploy the DUNE Catalog application on a Linux server.

## Prerequisites

1. Install required system packages:
```bash
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip nginx
```

2. Clone the repository:
```bash
cd /opt
sudo git clone https://github.com/your-username/dune_catalog.git
sudo chown -R dune:dune dune_catalog
```

## Setup Steps

1. Install dependencies:
```bash
# Install Node.js dependencies
cd /opt/dune_catalog
npm install
npm run build

# Install Python dependencies
pip3 install -r requirements.txt
```

2. Set up the systemd service:
```bash
# Copy service file
sudo cp deployment/dune-catalog.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dune-catalog
sudo systemctl start dune-catalog
```

3. Set up nginx:
```bash
# Copy nginx configuration
sudo cp deployment/nginx.conf /etc/nginx/sites-available/dune-catalog
sudo ln -s /etc/nginx/sites-available/dune-catalog /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site if exists
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

4. Configure firewall:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp  # If using HTTPS
```

## Environment Variables

Make sure to set up your `.env` file with the required environment variables:
```bash
cp .env.example .env
nano .env  # Edit with your values
```

## Monitoring

Check service status:
```bash
sudo systemctl status dune-catalog
sudo journalctl -u dune-catalog -f  # View logs
```

Check nginx status:
```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log  # View error logs
```

## SSL/HTTPS Setup (Optional)

To enable HTTPS with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Troubleshooting

1. If the service fails to start:
   - Check logs: `sudo journalctl -u dune-catalog -f`
   - Verify permissions: `sudo chown -R dune:dune /opt/dune_catalog`
   - Check environment variables: `sudo systemctl show dune-catalog`

2. If nginx returns 502 Bad Gateway:
   - Check if the backend service is running
   - Verify port configurations
   - Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`

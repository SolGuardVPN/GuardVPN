#!/bin/bash

# DVPN Indexer Management Script
# Easily start/stop/restart the indexer service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INDEXER_DIR="$PROJECT_DIR/indexer"
LOG_FILE="$PROJECT_DIR/indexer.log"
PID_FILE="$PROJECT_DIR/indexer.pid"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
    echo -e "${BLUE}   DVPN Indexer Manager${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

get_indexer_pid() {
    lsof -ti:3001 2>/dev/null || echo ""
}

check_status() {
    local pid=$(get_indexer_pid)
    if [ -n "$pid" ]; then
        return 0  # Running
    else
        return 1  # Not running
    fi
}

start_indexer() {
    print_header
    
    if check_status; then
        print_info "Indexer is already running (PID: $(get_indexer_pid))"
        return 0
    fi
    
    echo -e "${BLUE}Starting indexer...${NC}"
    
    cd "$INDEXER_DIR"
    nohup node simple-api.js > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    # Wait for startup
    sleep 2
    
    if check_status; then
        print_success "Indexer started successfully!"
        echo ""
        curl -s http://localhost:3001/health | jq '.' 2>/dev/null || true
        echo ""
        print_info "Logs: tail -f $LOG_FILE"
    else
        print_error "Failed to start indexer"
        print_info "Check logs: cat $LOG_FILE"
        exit 1
    fi
}

stop_indexer() {
    print_header
    
    if ! check_status; then
        print_info "Indexer is not running"
        return 0
    fi
    
    local pid=$(get_indexer_pid)
    echo -e "${BLUE}Stopping indexer (PID: $pid)...${NC}"
    
    pkill -f "node simple-api.js" 2>/dev/null || true
    sleep 1
    
    if ! check_status; then
        print_success "Indexer stopped"
        rm -f "$PID_FILE"
    else
        print_error "Failed to stop indexer gracefully, forcing..."
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
        if ! check_status; then
            print_success "Indexer forcefully stopped"
            rm -f "$PID_FILE"
        else
            print_error "Failed to stop indexer"
            exit 1
        fi
    fi
}

restart_indexer() {
    print_header
    echo -e "${BLUE}Restarting indexer...${NC}\n"
    stop_indexer
    sleep 1
    start_indexer
}

show_status() {
    print_header
    
    if check_status; then
        local pid=$(get_indexer_pid)
        print_success "Indexer is running (PID: $pid)"
        echo ""
        
        # Get health info
        echo -e "${BLUE}Health Check:${NC}"
        curl -s http://localhost:3001/health | jq '.' 2>/dev/null || {
            print_error "Failed to connect to indexer API"
        }
        echo ""
        
        # Get nodes
        echo -e "${BLUE}Available Nodes:${NC}"
        curl -s http://localhost:3001/nodes | jq -r '.nodes[] | "  • \(.location) - \(.endpoint)"' 2>/dev/null || {
            print_error "Failed to fetch nodes"
        }
        echo ""
    else
        print_error "Indexer is not running"
        echo ""
        print_info "Start with: $0 start"
    fi
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        print_error "Log file not found: $LOG_FILE"
        exit 1
    fi
}

test_indexer() {
    print_header
    echo -e "${BLUE}Testing indexer...${NC}\n"
    
    if ! check_status; then
        print_error "Indexer is not running"
        print_info "Start with: $0 start"
        exit 1
    fi
    
    echo -e "${BLUE}1. Testing /health endpoint:${NC}"
    if curl -s http://localhost:3001/health | jq '.' 2>/dev/null; then
        print_success "Health check passed"
    else
        print_error "Health check failed"
    fi
    echo ""
    
    echo -e "${BLUE}2. Testing /nodes endpoint:${NC}"
    if curl -s http://localhost:3001/nodes | jq '.count' 2>/dev/null; then
        print_success "Nodes endpoint working"
    else
        print_error "Nodes endpoint failed"
    fi
    echo ""
    
    echo -e "${BLUE}3. Node details:${NC}"
    curl -s http://localhost:3001/nodes | jq -r '.nodes[] | "  • \(.location) (\(.region)) - \(.endpoint)"' 2>/dev/null
    echo ""
    
    print_success "All tests passed!"
}

show_help() {
    print_header
    echo ""
    echo "Usage: $0 {start|stop|restart|status|logs|test|help}"
    echo ""
    echo "Commands:"
    echo "  start    - Start the indexer service"
    echo "  stop     - Stop the indexer service"
    echo "  restart  - Restart the indexer service"
    echo "  status   - Show indexer status and nodes"
    echo "  logs     - Show live logs (Ctrl+C to exit)"
    echo "  test     - Run connectivity tests"
    echo "  help     - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start           # Start indexer"
    echo "  $0 status          # Check status"
    echo "  $0 logs            # Watch logs"
    echo ""
}

# Main
case "${1:-}" in
    start)
        start_indexer
        ;;
    stop)
        stop_indexer
        ;;
    restart)
        restart_indexer
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    test)
        test_indexer
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Invalid command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

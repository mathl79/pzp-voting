document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const nameInput = document.getElementById('nameInput');
    const accountID = document.getElementById('accountID');
    const tabs = document.querySelectorAll('.tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const pollTitle = document.getElementById('poll-title');
    const optionsContainer = document.getElementById('options-container');
    const resultsChart = document.getElementById('results-chart');
    const createPollForm = document.getElementById('create-poll-form');
    const pollTitleInput = document.getElementById('poll-title-input');
    const addOptionBtn = document.getElementById('add-option');
    const pollOptionsContainer = document.getElementById('poll-options');
    const joinButton = document.getElementById('join-button');
    const inviteButton = document.getElementById('invite-button');
    const joinForm = document.getElementById('join-form');
    const inviteForm = document.getElementById('invite-form');
    const inviteCode = document.getElementById('invite-code');
    const copyInviteBtn = document.getElementById('copy-invite');
    const joinCodeInput = document.getElementById('join-code');
    const submitJoinBtn = document.getElementById('submit-join');
    const connectionsList = document.getElementById('connections-list');

    // State
    let currentPoll = null;
    let currentVote = null;
    let currentAccount = null;
    
    // Initialize account
    initializeAccount();
    
    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and panes
            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding pane
            tab.classList.add('active');
            const tabName = tab.getAttribute('data-tab');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
    
    // PZP event listeners
    window.pzpVoting.onPollUpdate(handlePollUpdate);
    window.pzpVoting.onVoteUpdate(handleVoteUpdate);
    window.pzpVoting.onConnections(updateConnections);
    
    // UI event listeners
    createPollForm.addEventListener('submit', handleCreatePoll);
    addOptionBtn.addEventListener('click', addPollOption);
    joinButton.addEventListener('click', showJoinForm);
    inviteButton.addEventListener('click', createInvite);
    copyInviteBtn.addEventListener('click', copyInviteToClipboard);
    submitJoinBtn.addEventListener('click', joinPoll);
    nameInput.addEventListener('change', updateProfileName);
    
    // Initialize poll options
    setupRemoveOptionButtons();
    
    // Functions
    
    async function initializeAccount() {
        try {
            const account = await window.pzpVoting.loadAccount();
            currentAccount = account;
            
            // Update UI
            nameInput.value = account.name || '';
            accountID.textContent = account.id;
            nameInput.disabled = false;
        } catch (error) {
            console.error('Failed to load account:', error);
        }
    }
    
    function updateProfileName() {
        const name = nameInput.value.trim();
        if (name) {
            window.pzpVoting.setProfileName(name)
                .then(updatedName => {
                    nameInput.value = updatedName;
                })
                .catch(error => {
                    console.error('Failed to update name:', error);
                });
        }
    }
    
    function handlePollUpdate(poll) {
        currentPoll = poll;
        
        // Update UI
        pollTitle.textContent = poll.title || 'Waiting for poll...';
        
        // Clear previous options
        optionsContainer.innerHTML = '';
        
        // Add new options
        if (poll.options && poll.options.length) {
            poll.options.forEach(option => {
                const button = document.createElement('button');
                button.className = 'option-button';
                button.textContent = option;
                button.dataset.option = option;
                
                // Check if this option is already voted for
                if (currentVote === option) {
                    button.classList.add('selected');
                }
                
                button.addEventListener('click', () => castVote(option));
                optionsContainer.appendChild(button);
            });
        }
        
        // Update results
        updateResults(poll.votes || {});
    }
    
    function handleVoteUpdate(update) {
        // Update UI to reflect new vote counts
        updateResults(update.votes || {});
    }
    
    function updateResults(votes) {
        // Clear previous results
        resultsChart.innerHTML = '';
        
        if (!currentPoll || !currentPoll.options) return;
        
        // Calculate total votes
        const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0) || 0;
        
        // Create result bars for each option
        currentPoll.options.forEach(option => {
            const count = votes[option] || 0;
            const percentage = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
            
            // Create label
            const label = document.createElement('div');
            label.className = 'result-label';
            label.innerHTML = `
                <span>${option}</span>
                <span>${count} vote${count !== 1 ? 's' : ''} (${percentage}%)</span>
            `;
            
            // Create bar
            const bar = document.createElement('div');
            bar.className = 'result-bar';
            
            // Create fill
            const fill = document.createElement('div');
            fill.className = 'result-fill';
            fill.style.width = `${percentage}%`;
            if (percentage > 0) {
                fill.textContent = `${percentage}%`;
            }
            
            bar.appendChild(fill);
            
            // Add to chart
            resultsChart.appendChild(label);
            resultsChart.appendChild(bar);
        });
    }
    
    async function castVote(option) {
        try {
            // Update UI immediately
            document.querySelectorAll('.option-button').forEach(btn => {
                btn.classList.remove('selected');
                if (btn.dataset.option === option) {
                    btn.classList.add('selected');
                }
            });
            
            // Send vote to PZP
            await window.pzpVoting.castVote(option);
            currentVote = option;
        } catch (error) {
            console.error('Failed to cast vote:', error);
            // Revert UI change on error
            document.querySelectorAll('.option-button').forEach(btn => {
                btn.classList.remove('selected');
                if (btn.dataset.option === currentVote) {
                    btn.classList.add('selected');
                }
            });
        }
    }
    
    function handleCreatePoll(event) {
        event.preventDefault();
        
        const title = pollTitleInput.value.trim();
        const optionInputs = pollOptionsContainer.querySelectorAll('.option-input');
        const options = Array.from(optionInputs)
            .map(input => input.value.trim())
            .filter(value => value);
        
        if (!title) {
            alert('Please enter a poll title');
            return;
        }
        
        if (options.length < 2) {
            alert('Please add at least two options');
            return;
        }
        
        window.pzpVoting.createPoll({ title, options })
            .then(poll => {
                // Reset form
                pollTitleInput.value = '';
                while (pollOptionsContainer.children.length > 2) {
                    pollOptionsContainer.removeChild(pollOptionsContainer.lastChild);
                }
                pollOptionsContainer.querySelectorAll('.option-input').forEach(input => {
                    input.value = '';
                });
                
                // Switch to vote tab
                tabs[0].click();
            })
            .catch(error => {
                console.error('Failed to create poll:', error);
                alert('Failed to create poll. Please try again.');
            });
    }
    
    function addPollOption() {
        const optionRow = document.createElement('div');
        optionRow.className = 'option-row';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'option-input';
        input.required = true;
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-option';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', function() {
            if (pollOptionsContainer.children.length > 2) {
                pollOptionsContainer.removeChild(optionRow);
            }
        });
        
        optionRow.appendChild(input);
        optionRow.appendChild(removeBtn);
        pollOptionsContainer.appendChild(optionRow);
    }
    
    function setupRemoveOptionButtons() {
        document.querySelectorAll('.remove-option').forEach(button => {
            button.addEventListener('click', function() {
                const row = this.parentElement;
                if (pollOptionsContainer.children.length > 2) {
                    pollOptionsContainer.removeChild(row);
                }
            });
        });
    }
    
    function showJoinForm() {
        joinForm.classList.remove('hidden');
        inviteForm.classList.add('hidden');
    }
    
    function createInvite() {
        inviteCode.textContent = 'Generating invite code...';
        inviteForm.classList.remove('hidden');
        joinForm.classList.add('hidden');
        
        window.pzpVoting.createInvite()
            .then(code => {
                inviteCode.textContent = code;
            })
            .catch(error => {
                console.error('Failed to create invite:', error);
                inviteCode.textContent = 'Error: Failed to create invite code';
            });
    }
    
    function copyInviteToClipboard() {
        const code = inviteCode.textContent;
        if (code && code !== 'Generating invite code...' && !code.startsWith('Error:')) {
            window.pzpVoting.copyToClipboard(code)
                .then(() => {
                    const originalText = copyInviteBtn.textContent;
                    copyInviteBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        copyInviteBtn.textContent = originalText;
                    }, 2000);
                })
                .catch(error => {
                    console.error('Failed to copy to clipboard:', error);
                });
        }
    }
    
    function joinPoll() {
        const code = joinCodeInput.value.trim();
        if (!code) {
            alert('Please enter an invite code');
            return;
        }
        
        window.pzpVoting.consumeInvite(code)
            .then(() => {
                joinCodeInput.value = '';
                joinForm.classList.add('hidden');
                // Switch to vote tab
                tabs[0].click();
            })
            .catch(error => {
                console.error('Failed to join poll:', error);
                alert('Failed to join poll. Please check the invite code and try again.');
            });
    }
    
    function updateConnections(connections) {
        connectionsList.innerHTML = '';
        
        if (connections.length === 0) {
            const noConnections = document.createElement('div');
            noConnections.textContent = 'No active connections';
            noConnections.className = 'text-gray-500 text-sm';
            connectionsList.appendChild(noConnections);
            return;
        }
        
        connections.forEach(([multiaddr, info]) => {
            const connection = document.createElement('div');
            connection.className = 'connection';
            
            const statusDot = document.createElement('div');
            statusDot.className = `connection-status ${info.state === 'connected' ? 'status-connected' : 'status-disconnected'}`;
            
            const idSpan = document.createElement('div');
            idSpan.className = 'connection-id';
            
            // Format multiaddr for display
            const formattedAddr = formatMultiaddr(multiaddr);
            idSpan.textContent = formattedAddr;
            
            connection.appendChild(statusDot);
            connection.appendChild(idSpan);
            connectionsList.appendChild(connection);
        });
    }
    
    function formatMultiaddr(multiaddr) {
        // Extract pubkey from multiaddr for display
        const parts = multiaddr.split('/');
        const shseIndex = parts.indexOf('shse');
        
        if (shseIndex !== -1 && parts.length > shseIndex + 1) {
            const pubkey = parts[shseIndex + 1].split('.')[0];
            return pubkey.substring(0, 10) + '...' + (multiaddr.includes('/ip4') ? ' (hub)' : '');
        }
        
        return multiaddr;
    }
});
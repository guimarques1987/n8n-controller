async function test() {
    try {
        const res = await fetch(`https://cardapioclick.uazapi.com/instance/all`, {
            headers: { 'admintoken': 'ln3ZJiO6sp8DTxb4DuyJOqAPAt5Rft0zonS6d32yrnwJ280g80' }
        });
        const data = await res.json();
        console.log("Instances List:");
        data.forEach(instance => {
            console.log(`- ID: ${instance.id}, Name: ${instance.name}, Status: ${instance.status}, Session: ${instance.sessionName}`);
        });
        console.log("Full data:", JSON.stringify(data.map(i => i.name || i.sessionName)));
    } catch (e) {
        console.error(e.message);
    }
}
test();

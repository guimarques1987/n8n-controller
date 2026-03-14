async function test() {
    try {
        const res = await fetch('https://cardapioclick.uazapi.com/instance/all', {
            headers: { 'admintoken': 'ln3ZJiO6sp8DTxb4DuyJOqAPAt5Rft0zonS6d32yrnwJ280g80' }
        });
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();

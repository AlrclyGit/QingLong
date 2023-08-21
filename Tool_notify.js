const axios = require('axios')

barkID = process.env.BARKID

function send(title, text = null, url = null) {
    let data = ''
    if (text == null) {
        data = { "body": title }
    } else if (url == null) {
        data = {
            'title': title,
            'body': text
        }
    } else {
        data = {
            'title': title,
            'body': text,
            'url': url
        }
    }
    let notifyUrl = `https://bark.alrcly.com/${barkID}`
    let config = {
        headers: {
            'Content-Type': 'application/json'
        }
    }
    axios.post(notifyUrl, data, config)
}

module.exports = send

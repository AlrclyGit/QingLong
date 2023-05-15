const axios = require('axios')

fsNotifyID = process.env.FSKEY

function send(title, text = null, url = null) {
    let data = ''
    if (text == null) {
        data = {
            'msg_type': 'text',
            'content': {
                'text': title
            }
        }
    } else if (url == null) {
        data = {
            'msg_type': 'post',
            'content': {
                'post': {
                    'zh_cn': {
                        'title': title,
                        'content': [
                            [
                                {
                                    'tag': 'text',
                                    'text': text
                                },
                            ]
                        ]
                    }
                }

            }
        }
    } else {
        data = {
            'msg_type': 'post',
            'content': {
                'post': {
                    'zh_cn': {
                        'title': title,
                        'content': [
                            [
                                {
                                    'tag': 'text',
                                    'text': text
                                },
                                {
                                    'tag': 'a',
                                    'text': '查看',
                                    'href': url
                                }
                            ]
                        ]
                    }
                }

            }
        }
    }
    let notifyUrl = `https://open.feishu.cn/open-apis/bot/v2/hook/${fsNotifyID}`
    let config = {
        headers: {
            'Content-Type': 'application/json'
        }
    }
    axios.post(notifyUrl, data, config)
}

module.exports = send
